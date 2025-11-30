'use client';

import { useState, useRef, useEffect } from 'react';
import { FaTable, FaComment, FaPaperPlane, FaTrash, FaArrowDown } from 'react-icons/fa';

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

  // Parse timestamp from log line
  const parseTimestamp = (line: string): Date | null => {
    const timestampMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}\.\d{3} [AP]M)/);
    if (timestampMatch) {
      try {
        return new Date(timestampMatch[1]);
      } catch (e) {
        console.error('Failed to parse timestamp:', timestampMatch[1]);
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
        requestTimestamp = parseTimestamp(line) || undefined;
      }
      if (line.toLowerCase().includes('response journal entry created')) {
        hasResponse = true;
        responseTimestamp = parseTimestamp(line) || undefined;
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

  // Get unified numbering for requests and responses
  const getNumberedEntries = () => {
    // Create an array of all events (both requests and responses)
    const allEvents: Array<{
      id: string;
      type: 'request' | 'response';
      timestamp: Date;
      logEntry: LogEntry;
    }> = [];

    logEntries.forEach(entry => {
      if (entry.hasRequest && entry.requestTimestamp) {
        allEvents.push({
          id: entry.id + '-request',
          type: 'request',
          timestamp: entry.requestTimestamp,
          logEntry: entry
        });
      }
      if (entry.hasResponse && entry.responseTimestamp) {
        allEvents.push({
          id: entry.id + '-response',
          type: 'response',
          timestamp: entry.responseTimestamp,
          logEntry: entry
        });
      }
    });

    // Sort all events by timestamp
    const sortedEvents = allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Create maps for quick lookup
    const requestNumberMap = new Map();
    const responseNumberMap = new Map();

    // Assign sequential numbers to all events in chronological order
    sortedEvents.forEach((event, index) => {
      if (event.type === 'request') {
        requestNumberMap.set(event.logEntry.id, index + 1);
      } else {
        responseNumberMap.set(event.logEntry.id, index + 1);
      }
    });

    // Return entries with their unified numbers
    return logEntries.map(entry => ({
      ...entry,
      requestNumber: entry.hasRequest ? requestNumberMap.get(entry.id) || null : null,
      responseNumber: entry.hasResponse ? responseNumberMap.get(entry.id) || null : null
    }));
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

  // Range-based grouping logic
  const getTableGroups = () => {
    if (numberedEntries.length === 0) return [];

    const groups: TableGroup[] = [];
    
    // Sort entries by their minimum number
    const sortedEntries = [...numberedEntries].sort((a, b) => {
      const rangeA = getEntryRange(a);
      const rangeB = getEntryRange(b);
      return rangeA.min - rangeB.min;
    });

    sortedEntries.forEach(entry => {
      const entryRange = getEntryRange(entry);
      
      // Find if this entry fits into any existing group
      let foundGroup = false;
      
      for (const group of groups) {
        // Check if entry's numbers are within the group's range
        const isWithinGroupRange = 
          (entryRange.min >= group.minNumber && entryRange.min <= group.maxNumber) ||
          (entryRange.max >= group.minNumber && entryRange.max <= group.maxNumber) ||
          (entryRange.min <= group.minNumber && entryRange.max >= group.maxNumber);

        if (isWithinGroupRange) {
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

  // Draw connecting lines
  const drawConnectingLines = () => {
    if (!svgRef.current || !tableContainerRef.current) return;

    const svg = svgRef.current;
    svg.innerHTML = ''; // Clear existing lines

    const positions = getAllNumberPositions();

    // Draw lines between ALL consecutive numbers (regardless of table)
    for (let i = 0; i < positions.length - 1; i++) {
      const current = positions[i];
      const next = positions[i + 1];

      // Create line element
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

    console.log('Drawn lines between:', positions.map(p => p.number).join(' → '));
  };

  // Redraw lines when entries change
  useEffect(() => {
    const timer = setTimeout(() => {
      drawConnectingLines();
    }, 300); // Increased timeout to ensure DOM is ready

    return () => clearTimeout(timer);
  }, [tableGroups]);

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
                <FaTable size={24} color="var(--primary-color)" style={{ marginRight: '0.75rem' }} />
                <h1 style={{ 
                  background: 'linear-gradient(135deg, var(--primary-dark), var(--primary-color))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  margin: 0
                }}>
                  Logs Visualization
                </h1>
              </div>
              
              {logEntries.length > 0 && (
                <button 
                  onClick={clearAllData}
                  className="btn"
                  style={{ 
                    background: 'transparent', 
                    color: 'var(--text-light)',
                    border: '1px solid var(--border)',
                    padding: '0.5rem 1rem'
                  }}
                >
                  <FaTrash size={14} style={{ marginRight: '0.5rem' }} />
                  Clear All
                </button>
              )}
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
                    zIndex: 5 // Higher z-index to be above tables
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
                            Sequence Group {groupIndex + 1}
                          </h3>
                          <span style={{ 
                            marginLeft: '1rem',
                            color: 'var(--text-light)',
                            fontSize: '0.9rem'
                          }}>
                            {group.entries.length} log(s)
                          </span>
                        </div>
                        <span style={{ 
                          color: 'var(--text-light)',
                          fontSize: '0.8rem',
                          background: 'var(--background-alt)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                        </span>
                      </div>

                      {/* Table with transparent background for lines to show through */}
                      <div style={{ 
                        overflow: 'auto',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        marginBottom: '1rem',
                        background: 'transparent', // Make table container transparent
                        position: 'relative'
                      }}>
                        <table style={{ 
                          width: '100%',
                          borderCollapse: 'collapse',
                          background: 'transparent' // Make table transparent
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
                                  background: 'transparent' // Make rows transparent
                                }}
                              >
                                <td style={{ 
                                  padding: '1rem',
                                  borderRight: '1px solid var(--border)',
                                  fontSize: '0.9rem',
                                  background: 'var(--background)'
                                }}>
                                  {entry.firstColumn.split('|').map((part, index, array) => (
                                    <span key={index}>
                                      {index === 0 ? (
                                        <span style={{ fontWeight: 'bold' }}>{part}</span>
                                      ) : (
                                        part
                                      )}
                                      {index < array.length - 1 && '|'}
                                    </span>
                                  ))}
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
                                        zIndex: 10 // High z-index for numbers
                                      }}
                                      title={`Request #${entry.requestNumber} - ${entry.requestTimestamp?.toLocaleString()}`}
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
                                        zIndex: 10 // High z-index for numbers
                                      }}
                                      title={`Response #${entry.responseNumber} - ${entry.responseTimestamp?.toLocaleString()}`}
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
              Enter log data to visualize as tables
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
                    <strong>Example:</strong>
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
                placeholder="Paste your log data here... (Shift+Enter for new line)"
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
                Visualize Log
                <FaPaperPlane size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}