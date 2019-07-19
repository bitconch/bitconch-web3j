import {Client as RpcWebSocketClient} from 'rpc-websockets';

export const mockRpcEnabled = !process.env.TEST_LIVE;

let mockNotice = true;

export class Client {
  client: RpcWebSocketClient;

  constructor(url, options) {
    if (!mockRpcEnabled) {
      if (mockNotice) {
        console.log(
          'Note: rpc-websockets mock is disabled, testing live against',
          url,
        );
        mockNotice = false;
      }
      this.client = new RpcWebSocketClient(url, options);
    }
  }

  connect() {
    if (!mockRpcEnabled) {
      return this.client.connect();
    }
  }

  close() {
    if (!mockRpcEnabled) {
      return this.client.close();
    }
  }

  on(event: string, callback: Function) {
    if (!mockRpcEnabled) {
      return this.client.on(event, callback);
    }
  }

  async call(method: string, params: Object): Promise<Object> {
    if (!mockRpcEnabled) {
      return await this.client.call(method, params);
    }
    throw new Error('call unsupported');
  }
}
