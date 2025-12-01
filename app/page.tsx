'use client';

import { useState, useRef, useEffect } from 'react';
import { FaTable, FaComment, FaPaperPlane, FaLongArrowAltDown } from 'react-icons/fa';
import { SiLogstash } from "react-icons/si";

interface LogEntry {
  id: string;
  rawText: string;
  firstColumn: string;
  hasRequest: boolean;
  hasResponse: boolean;
  timestamp: Date;
  requestTimestamp?: Date;
  responseTimestamp?: Date;
  requestNumber?: number | null;
  responseNumber?: number | null;
}

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface TableGroup {
  id: string;
  entries: LogEntry[];
  minNumber: number;
  maxNumber: number;
}

interface NumberPosition {
  number: number;
  type: 'request' | 'response';
  x: number;
  y: number;
  element: HTMLElement;
}

export default function LogsVisualization() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  // Parse timestamp from log line - FIXED FOR YOUR FORMAT
  const parseTimestamp = (line: string): Date | null => {
    const timestampMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}\.\d{3} [AP]M)/);
    if (timestampMatch) {
      try {
        const dateStr = timestampMatch[1];
        // Convert to 24-hour format for reliable parsing
        const dateTimeParts = dateStr.split(' ');
        const datePart = dateTimeParts[0]; // MM/DD/YYYY
        const timePart = dateTimeParts[1]; // HH:MM:SS.mmm
        const ampm = dateTimeParts[2]; // AM/PM
        
        // Split time into hours, minutes, seconds, milliseconds
        const timeParts = timePart.split(':');
        let hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);
        const secondsAndMs = timeParts[2].split('.');
        const seconds = parseInt(secondsAndMs[0]);
        const milliseconds = parseInt(secondsAndMs[1]);
        
        // Convert 12-hour format to 24-hour format
        if (ampm === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0;
        }
        
        // Parse the date part (MM/DD/YYYY)
        const dateParts = datePart.split('/');
        const month = parseInt(dateParts[0]) - 1; // Months are 0-indexed in JS
        const day = parseInt(dateParts[1]);
        const year = parseInt(dateParts[2]);
        
        // Create Date object
        return new Date(year, month, day, hours, minutes, seconds, milliseconds);
      } catch (e) {
        console.error('Failed to parse timestamp:', timestampMatch[1], e);
        return null;
      }
    }
    return null;
  };

  const parseLogEntry = (text: string): Omit<LogEntry, 'id' | 'timestamp'> => {
    const lines = text.split('\n').filter(line => line.trim());
    const firstLine = lines[0] || '';
    
    let hasRequest = false;
    let hasResponse = false;
    let requestTimestamp: Date | undefined;
    let responseTimestamp: Date | undefined;

    lines.forEach(line => {
      if (line.toLowerCase().includes('request journal entry created')) {
        hasRequest = true;
        const ts = parseTimestamp(line);
        if (ts) {
          requestTimestamp = ts;
          console.log('Parsed request timestamp:', ts, 'from line:', line);
        }
      }
      if (line.toLowerCase().includes('response journal entry created')) {
        hasResponse = true;
        const ts = parseTimestamp(line);
        if (ts) {
          responseTimestamp = ts;
          console.log('Parsed response timestamp:', ts, 'from line:', line);
        }
      }
    });

    return {
      rawText: text,
      firstColumn: firstLine,
      hasRequest,
      hasResponse,
      requestTimestamp,
      responseTimestamp
    };
  };

  // Get combined sequential numbering for ALL events (both requests and responses)
  // RE-EVALUATES EVERY TIME NEW LOG IS ADDED
  const getNumberedEntries = () => {
    if (logEntries.length === 0) return [];

    console.log('=== RE-EVALUATING ALL NUMBERS ===');
    console.log('Total log entries:', logEntries.length);

    // Create an array of ALL events from ALL log entries
    const allEvents: Array<{
      id: string;
      logEntryId: string;
      type: 'request' | 'response';
      timestamp: Date;
      logEntry: LogEntry;
    }> = [];

    // Collect ALL events from ALL log entries
    logEntries.forEach(entry => {
      if (entry.hasRequest && entry.requestTimestamp) {
        allEvents.push({
          id: `${entry.id}-request`,
          logEntryId: entry.id,
          type: 'request',
          timestamp: entry.requestTimestamp,
          logEntry: entry
        });
        console.log(`Added request event for ${entry.id}:`, entry.requestTimestamp);
      }
      
      if (entry.hasResponse && entry.responseTimestamp) {
        allEvents.push({
          id: `${entry.id}-response`,
          logEntryId: entry.id,
          type: 'response',
          timestamp: entry.responseTimestamp,
          logEntry: entry
        });
        console.log(`Added response event for ${entry.id}:`, entry.responseTimestamp);
      }
    });

    // Sort ALL events by their timestamp in ascending order
    const sortedEvents = allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.log('Sorted events (earliest to latest):');
    sortedEvents.forEach((event, index) => {
      console.log(`  ${index + 1}. ${event.type} from ${event.logEntryId}:`, event.timestamp);
    });

    // Assign sequential numbers 1, 2, 3... to ALL events
    const eventNumberMap = new Map<string, number>();
    sortedEvents.forEach((event, index) => {
      eventNumberMap.set(event.id, index + 1);
    });

    // Create new log entries with updated numbers
    const updatedEntries = logEntries.map(entry => {
      const updatedEntry = { ...entry };
      
      if (entry.hasRequest && entry.requestTimestamp) {
        updatedEntry.requestNumber = eventNumberMap.get(`${entry.id}-request`) || null;
      }
      
      if (entry.hasResponse && entry.responseTimestamp) {
        updatedEntry.responseNumber = eventNumberMap.get(`${entry.id}-response`) || null;
      }
      
      return updatedEntry;
    });

    console.log('Updated entries with new numbers:');
    updatedEntries.forEach(entry => {
      console.log(`  ${entry.firstColumn}: Request=${entry.requestNumber}, Response=${entry.responseNumber}`);
    });

    return updatedEntries;
  };

  const numberedEntries = getNumberedEntries();

  // Get all numbers from an entry (both request and response)
  const getEntryNumbers = (entry: LogEntry): number[] => {
    const numbers: number[] = [];
    if (entry.requestNumber) numbers.push(entry.requestNumber);
    if (entry.responseNumber) numbers.push(entry.responseNumber);
    return numbers;
  };

  // Get the range of numbers for an entry
  const getEntryRange = (entry: LogEntry): { min: number; max: number } => {
    const numbers = getEntryNumbers(entry);
    if (numbers.length === 0) return { min: Infinity, max: -Infinity };
    return {
      min: Math.min(...numbers),
      max: Math.max(...numbers)
    };
  };

  // Enhanced range-based grouping logic
  const getTableGroups = () => {
    if (numberedEntries.length === 0) return [];

    const groups: TableGroup[] = [];
    
    // Sort entries by their minimum number
    const sortedEntries = [...numberedEntries].sort((a, b) => {
      const rangeA = getEntryRange(a);
      const rangeB = getEntryRange(b);
      return rangeA.min - rangeB.min;
    });

    // Group entries that share overlapping number ranges
    sortedEntries.forEach(entry => {
      const entryRange = getEntryRange(entry);
      
      // If entry has no numbers, put it in its own group
      if (entryRange.min === Infinity || entryRange.max === -Infinity) {
        groups.push({
          id: `group-${groups.length + 1}`,
          entries: [entry],
          minNumber: 0,
          maxNumber: 0
        });
        return;
      }
      
      // Find if this entry fits into any existing group
      let foundGroup = false;
      
      for (const group of groups) {
        // Check if entry's number range overlaps with group's range
        const overlaps = !(entryRange.max < group.minNumber || entryRange.min > group.maxNumber);
        
        if (overlaps) {
          group.entries.push(entry);
          group.minNumber = Math.min(group.minNumber, entryRange.min);
          group.maxNumber = Math.max(group.maxNumber, entryRange.max);
          foundGroup = true;
          break;
        }
      }

      // If no group found, create a new one
      if (!foundGroup) {
        groups.push({
          id: `group-${groups.length + 1}`,
          entries: [entry],
          minNumber: entryRange.min,
          maxNumber: entryRange.max
        });
      }
    });

    // Sort entries within each group by their minimum number
    groups.forEach(group => {
      group.entries.sort((a, b) => {
        const rangeA = getEntryRange(a);
        const rangeB = getEntryRange(b);
        return rangeA.min - rangeB.min;
      });
    });

    // Sort groups by their minimum number
    return groups.sort((a, b) => a.minNumber - b.minNumber);
  };

  const tableGroups = getTableGroups();

  // Get all number positions for drawing lines
  const getAllNumberPositions = (): NumberPosition[] => {
    if (!tableContainerRef.current) return [];

    const positions: NumberPosition[] = [];
    const containerRect = tableContainerRef.current.getBoundingClientRect();

    // Find all number elements
    const numberElements = tableContainerRef.current.querySelectorAll('[data-number-type]');
    
    numberElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const number = parseInt(element.textContent || '0');
      const type = element.getAttribute('data-number-type') as 'request' | 'response';

      positions.push({
        number,
        type,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
        element: element as HTMLElement
      });
    });

    // Sort by number for proper sequence
    return positions.sort((a, b) => a.number - b.number);
  };

  // Draw connecting lines between all numbers in sequence
  const drawConnectingLines = () => {
    if (!svgRef.current || !tableContainerRef.current) return;

    const svg = svgRef.current;
    svg.innerHTML = ''; // Clear existing lines

    const positions = getAllNumberPositions();

    // Draw lines between ALL consecutive numbers
    for (let i = 0; i < positions.length - 1; i++) {
      const current = positions[i];
      const next = positions[i + 1];
      
      // Only draw line if numbers are consecutive (1→2, 2→3, etc.)
      if (next.number === current.number + 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', current.x.toString());
        line.setAttribute('y1', current.y.toString());
        line.setAttribute('x2', next.x.toString());
        line.setAttribute('y2', next.y.toString());
        
        // Set line style based on type
        const isRequestLine = current.type === 'request' && next.type === 'request';
        const isResponseLine = current.type === 'response' && next.type === 'response';
        
        if (isRequestLine) {
          line.setAttribute('stroke', 'var(--primary-color)');
          line.setAttribute('stroke-width', '3');
        } else if (isResponseLine) {
          line.setAttribute('stroke', '#3b82f6');
          line.setAttribute('stroke-width', '3');
        } else {
          // Mixed type line (request to response or vice versa)
          line.setAttribute('stroke', '#8b5cf6');
          line.setAttribute('stroke-width', '2');
        }
        
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('opacity', '0.8');
        svg.appendChild(line);
      }
    }

    console.log('Number sequence:', positions.map(p => `${p.type.charAt(0)}${p.number}`).join(' → '));
  };

  // Redraw lines when entries change
  useEffect(() => {
    const timer = setTimeout(() => {
      drawConnectingLines();
    }, 300);

    return () => clearTimeout(timer);
  }, [numberedEntries, tableGroups]);

  // Redraw lines on window resize
  useEffect(() => {
    const handleResize = () => {
      drawConnectingLines();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date()
    };

    // Parse and add to table
    const parsedEntry = parseLogEntry(inputText);
    const newLogEntry: LogEntry = {
      ...parsedEntry,
      id: Date.now().toString(),
      timestamp: new Date()
    };

    setLogEntries(prev => [...prev, newLogEntry]);
    setChatMessages(prev => [...prev, userMessage]);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearAllData = () => {
    setLogEntries([]);
    setChatMessages([]);
  };

  // Get all numbers for statistics
  const allNumbers = numberedEntries.flatMap(entry => 
    [entry.requestNumber, entry.responseNumber].filter(num => num !== null && num !== undefined) as number[]
  );
  const totalEvents = allNumbers.length;
  const minNumber = totalEvents > 0 ? Math.min(...allNumbers) : 0;
  const maxNumber = totalEvents > 0 ? Math.max(...allNumbers) : 0;

  return (
    <div className="app-container">
      <div className="main-layout">
        {/* Main Content - Visualization Area */}
        <main className="main-content" style={{ marginRight: '400px' }}>
          <div className="card" style={{ position: 'relative', overflow: 'visible' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <SiLogstash size={24} color="var(--primary-color)" style={{ marginRight: '0.75rem' }} />
                <h1 style={{ 
                  background: 'linear-gradient(135deg, var(--primary-dark), var(--primary-color))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  margin: 0
                }}>
                  Kita
                </h1>
              </div>
              
            </div>

            {tableGroups.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '4rem 2rem',
                color: 'var(--text-light)'
              }}>
                <FaTable size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                  No Logs Visualized Yet
                </h3>
                <p>Start chatting in the panel to the right to visualize your logs as tables.</p>
              </div>
            ) : (
              <div ref={tableContainerRef} style={{ position: 'relative', minHeight: '200px' }}>
                {/* SVG Overlay for connecting lines - PLACED BEFORE TABLES */}
                <svg
                  ref={svgRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 5
                  }}
                />

                {tableGroups.map((group, groupIndex) => (
                  <div key={group.id} style={{ position: 'relative', zIndex: 2 }}>
                    {/* Table Group */}
                    <div style={{ marginBottom: '2rem', background: 'var(--background)', borderRadius: '8px' }}>
                      {/* Table Header */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                        padding: '0.5rem 0',
                        borderBottom: '2px solid var(--border)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <h3 style={{ 
                            color: 'var(--primary-dark)',
                            margin: 0,
                            fontSize: '1.1rem'
                          }}>
                             Set {groupIndex + 1}
                          </h3>
                         
                        </div>
                        {/* <span style={{ 
                          color: 'var(--text-light)',
                          fontSize: '0.8rem',
                          background: 'var(--background-alt)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          Sequence: {group.minNumber} - {group.maxNumber}
                        </span> */}
                      </div>

                      {/* Table with transparent background for lines to show through */}
                      <div style={{ 
                        overflow: 'auto',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        marginBottom: '1rem',
                        background: 'transparent',
                        position: 'relative'
                      }}>
                        <table style={{ 
                          width: '100%',
                          borderCollapse: 'collapse',
                          background: 'transparent'
                        }}>
                          <thead>
                            <tr style={{ 
                              background: 'linear-gradient(135deg, var(--background-alt), var(--border-light))',
                              borderBottom: '2px solid var(--border)'
                            }}>
                              <th style={{ 
                                padding: '1rem',
                                textAlign: 'left',
                                fontWeight: '600',
                                color: 'var(--primary-dark)',
                                borderRight: '1px solid var(--border)'
                              }}>
                                Log Entry
                              </th>
                              <th style={{ 
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: '600',
                                color: 'var(--primary-dark)',
                                borderRight: '1px solid var(--border)',
                                width: '100px'
                              }}>
                                Request
                              </th>
                              <th style={{ 
                                padding: '1rem',
                                textAlign: 'center',
                                fontWeight: '600',
                                color: 'var(--primary-dark)',
                                width: '100px'
                              }}>
                                Response
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map((entry) => (
                              <tr 
                                key={entry.id}
                                style={{ 
                                  borderBottom: '1px solid var(--border)',
                                  transition: 'background-color 0.2s ease',
                                  background: 'transparent'
                                }}
                              >
                                <td style={{ 
                                  padding: '1rem',
                                  borderRight: '1px solid var(--border)',
                                  fontSize: '0.9rem',
                                  background: 'var(--background)'
                                }}>
                                  {entry.firstColumn}
                                </td>
                                <td style={{ 
                                  padding: '1rem',
                                  borderRight: '1px solid var(--border)',
                                  textAlign: 'center',
                                  background: 'transparent'
                                }}>
                                  {entry.requestNumber && (
                                    <div
                                      data-number-type="request"
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: 'var(--primary-color)',
                                        color: 'white',
                                        margin: '0 auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '600',
                                        fontSize: '0.9rem',
                                        boxShadow: 'var(--shadow)',
                                        position: 'relative',
                                        zIndex: 10
                                      }}
                                      title={`Request #${entry.requestNumber} at ${entry.requestTimestamp?.toLocaleTimeString([], { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true 
                                      })}`}
                                    >
                                      {entry.requestNumber}
                                    </div>
                                  )}
                                </td>
                                <td style={{ 
                                  padding: '1rem',
                                  textAlign: 'center',
                                  background: 'transparent'
                                }}>
                                  {entry.responseNumber && (
                                    <div
                                      data-number-type="response"
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: '#3b82f6',
                                        color: 'white',
                                        margin: '0 auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '600',
                                        fontSize: '0.9rem',
                                        boxShadow: 'var(--shadow)',
                                        position: 'relative',
                                        zIndex: 10
                                      }}
                                      title={`Response #${entry.responseNumber} at ${entry.responseTimestamp?.toLocaleTimeString([], { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true 
                                      })}`}
                                    >
                                      {entry.responseNumber}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Down Arrow (except for last group) */}
                    {groupIndex < tableGroups.length - 1 && (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        position: 'relative',
                        zIndex: 2
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--primary-color)'
                          }}>
                            <FaLongArrowAltDown size={40} />
                          </div>
                          <span style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-light)',
                            fontWeight: '500'
                          }}>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </main>

        {/* Chat Sidebar */}
        <div style={{
          width: '400px',
          minWidth: '400px',
          height: '100vh',
          position: 'fixed',
          right: 0,
          top: 0,
          background: 'var(--background-sidebar)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--background)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FaComment size={20} color="var(--primary-color)" />
              <h3 style={{ margin: 0, color: 'var(--primary-dark)' }}>Log Input</h3>
            </div>
            <p style={{ 
              margin: '0.5rem 0 0 0', 
              fontSize: '0.9rem',
              color: 'var(--text-light)'
            }}>
              Enter log data to visualize as tables. 
            </p>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
              {chatMessages.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-light)',
                  padding: '2rem 1rem'
                }}>
                  <FaComment size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No messages yet. Start by entering log data below.</p>
                  <div style={{ 
                    background: 'var(--background-alt)',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginTop: '1rem',
                    textAlign: 'left',
                    fontSize: '0.85rem'
                  }}>
                    <strong>Example format:</strong>
                    <br />
                    Dev to Aut | PGA
                    <br />
                    Request journal entry created: 11/27/2025 5:16:55.930 AM (Asia)
                    <br />
                    Response journal entry created: 11/27/2025 5:16:56.131 AM (Asia)
                  </div>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      alignSelf: 'flex-end',
                      maxWidth: '85%'
                    }}
                  >
                    <div
                      style={{
                        background: 'linear-gradient(135deg, var(--primary-color), var(--primary-light))',
                        color: 'white',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: 'var(--shadow-md)',
                        wordBreak: 'break-word'
                      }}
                    >
                      {message.text.split('\n').map((line, index) => (
                        <div key={index}>
                          {line}
                          {index < message.text.split('\n').length - 1 && <br />}
                        </div>
                      ))}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-light)',
                      marginTop: '0.25rem',
                      textAlign: 'right'
                    }}>
                      {message.timestamp.toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '1.5rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--background)'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Paste your log data here..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  maxHeight: '200px',
                  padding: '0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--background)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  resize: 'none',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim()}
                className="btn"
                style={{
                  alignSelf: 'flex-end',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: inputText.trim() ? 1 : 0.6
                }}
              >
                Visualize
                <FaPaperPlane size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}