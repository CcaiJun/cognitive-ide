import type { WSServerEvent, WSClientEvent } from '@cognition-ide/shared-types';

type WSCallback = (event: WSServerEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private projectId: string | null = null;
  private listeners: Map<string, Set<WSCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(projectId: string) {
    this.projectId = projectId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/${projectId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`[WS] Connected to project ${projectId}`);
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data: WSServerEvent = JSON.parse(event.data);
        this.dispatch(data);
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.projectId = null;
  }

  send(event: WSClientEvent) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      console.warn('[WS] Cannot send — not connected');
    }
  }

  on(eventType: string, callback: WSCallback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  off(eventType: string, callback: WSCallback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.delete(callback);
    }
  }

  private dispatch(event: WSServerEvent) {
    const type = event.type;
    // Notify type-specific listeners
    if (this.listeners.has(type)) {
      for (const cb of this.listeners.get(type)!) {
        cb(event);
      }
    }
    // Notify wildcard listeners
    if (this.listeners.has('*')) {
      for (const cb of this.listeners.get('*')!) {
        cb(event);
      }
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }
    if (!this.projectId) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.projectId!);
    }, delay);
  }

  // ---- Convenience methods ----

  notifyFileChange(path: string, content: string) {
    this.send({
      type: 'file_change',
      path,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  subscribeNode(nodeId: string) {
    this.send({ type: 'subscribe_node', node_id: nodeId });
  }

  unsubscribeNode(nodeId: string) {
    this.send({ type: 'unsubscribe_node', node_id: nodeId });
  }

  sendAIRequest(requestId: string, instruction: string) {
    this.send({ type: 'ai_request', request_id: requestId, instruction });
  }

  confirmAI(requestId: string, cognitionApproved: boolean, codeApproved: boolean) {
    this.send({ type: 'ai_confirm', request_id: requestId, cognition_approved: cognitionApproved, code_approved: codeApproved });
  }
}

// Singleton
export const wsClient = new WebSocketClient();