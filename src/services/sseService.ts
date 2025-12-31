import { Response } from 'express';

class SseService {
  // Map UserID -> Response object
  private clients: Map<string, any> = new Map();

  addClient(userId: string, client: any) {
    console.log(`[SSE-SERVICE] Attempting to add client ${userId} and set SSE headers.`);
    client.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    });
    console.log(`[SSE-SERVICE] Headers sent for client ${userId}. Content-Type: text/event-stream.`);
    
    // If user already had a connection, close old one (or we could support arrays for multi-tab)
    // For simplicity, we replace.
    this.clients.set(userId, client);
    console.log(`SSE: User ${userId} connected.`);

    client.on('close', () => {
      this.clients.delete(userId);
      console.log(`SSE: User ${userId} disconnected.`);
    });
  }

  sendEvent<T>(userId: string, eventName: string, data: T) {
    const client = this.clients.get(userId);
    if (client) {
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        client.write(payload);
    }
  }
}

export const sseService = new SseService();