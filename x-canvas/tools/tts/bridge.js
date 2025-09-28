/**
 * Native TTS Bridge for iOS
 * 处理 WebView 和 native TTS 之间的通信
 */

// 创建 native TTS bridge
(function () {
  if (window.nativeTTSBridge) {
    console.log('Native TTS bridge already exists');
    return; // 避免重复创建
  }

  // 检查 WebKit message handlers 是否可用
  const isNativeAvailable = () => {
    return !!(
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.nativeTTSBridge
    );
  };

  // 创建桥接对象
  window.nativeTTSBridge = {
    // 发送消息到 native
    sendMessage(action, data = {}) {
      if (isNativeAvailable()) {
        try {
          window.webkit.messageHandlers.nativeTTSBridge.postMessage({
            action: action,
            data: data,
          });
        } catch (error) {
          console.error('Failed to send message to native:', error);
        }
      } else {
        console.warn('Native TTS bridge not available');
      }
    },

    // TTS 控制方法
    speak(ssml) {
      this.sendMessage('speak', { ssml: ssml });
    },

    pause() {
      this.sendMessage('pause');
    },

    resume() {
      this.sendMessage('resume');
    },

    stop() {
      this.sendMessage('stop');
    },

    skipNext() {
      this.sendMessage('skipNext');
    },

    skipPrevious() {
      this.sendMessage('skipPrevious');
    },

    getVoices() {
      this.sendMessage('getVoices');
    },

    // 事件监听相关方法
    addEventListener(eventType, callback) {
      if (typeof callback !== 'function') {
        console.warn('TTS Bridge: callback must be a function');
        return;
      }

      const handler = (event) => {
        if (event.detail && event.detail.type === eventType) {
          try {
            callback(event.detail.data);
          } catch (error) {
            console.error(`TTS Bridge: Error in ${eventType} callback:`, error);
          }
        }
      };

      window.addEventListener('nativeTTSEvent', handler);

      // 返回一个移除监听器的函数
      return () => {
        window.removeEventListener('nativeTTSEvent', handler);
      };
    },

    removeEventListener(eventType, callback) {
      window.removeEventListener('nativeTTSEvent', callback);
    },

    // 检查 bridge 可用性
    isAvailable() {
      return isNativeAvailable();
    },
  };

  // 等待一小段时间确保 WebKit 准备就绪，然后触发就绪事件
  setTimeout(() => {
    if (isNativeAvailable()) {
      console.log('Native TTS bridge initialized successfully');
      window.dispatchEvent(
        new CustomEvent('nativeTTSBridgeReady', {
          detail: { available: true },
        })
      );
    } else {
      console.warn('Native TTS bridge not available on this platform');
      window.dispatchEvent(
        new CustomEvent('nativeTTSBridgeReady', {
          detail: { available: false },
        })
      );
    }
  }, 100);

  // 监听来自 native 的 showTTS 事件
  window.addEventListener('showTTS', () => {
    // 动态导入并初始化 TTS 模块
    import('./index.js')
      .then((module) => {
        if (!window.nativeTTS) {
          window.nativeTTS = module.initNativeTTS({
            autoShow: true,
          });
        } else {
          window.nativeTTS.show();
        }
      })
      .catch((error) => {
        console.error('Failed to load TTS module:', error);
      });
  });
})();

// 导出 bridge (用于模块化)
export default window.nativeTTSBridge;
