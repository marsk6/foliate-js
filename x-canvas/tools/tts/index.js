/**
 * Native TTS Module
 * iOS 原生 TTS 功能模块的主入口
 */


import { SSMLBuilder } from './ssml-builder.js';
import { TTSController } from './tts-controller.js';
import { TTSUI } from './tts-ui.js';
import './bridge.js';

// 全局 TTS 实例
let globalTTSInstance = null;

/**
 * 初始化 TTS 功能
 * @param {Object} options - 初始化选项
 * @returns {Object} TTS 实例对象
 */
export function initNativeTTS(options = {}) {
    const {
        container = document.body,
        autoShow = false,
        ...ttsOptions
    } = options;

    if (globalTTSInstance) {
        console.warn('TTS already initialized, returning existing instance');
        return globalTTSInstance;
    }

    // 创建控制器
    const controller = new TTSController();
    
    // 设置初始选项
    if (Object.keys(ttsOptions).length > 0) {
        controller.setOptions(ttsOptions);
    }

    // 创建 UI
    const ui = new TTSUI(controller, container);

    // 创建实例对象
    const instance = {
        controller,
        ui,
        ssmlBuilder: controller.ssmlBuilder,

        // 快捷方法
        speak: (text, options) => controller.speak(text, options),
        pause: () => controller.pause(),
        resume: () => controller.resume(),
        stop: () => controller.stop(),
        toggle: () => controller.toggle(),
        
        show: () => ui.show(),
        hide: () => ui.hide(),
        togglePanel: () => ui.toggle(),
        
        speakSelection: () => ui.speakSelectedText(),
        
        getState: () => controller.getState(),
        getOptions: () => controller.getOptions(),
        setOptions: (options) => controller.setOptions(options),
        
        // 事件监听
        addEventListener: (event, callback) => controller.addEventListener(event, callback),
        removeEventListener: (event, callback) => controller.removeEventListener(event, callback),
        
        // 销毁
        destroy: () => {
            controller.destroy();
            ui.destroy();
            globalTTSInstance = null;
        }
    };

    // 自动显示面板
    if (autoShow) {
        ui.show();
    }

    globalTTSInstance = instance;
    return instance;
}

/**
 * 获取全局 TTS 实例
 * @returns {Object|null} TTS 实例或 null
 */
export function getTTSInstance() {
    return globalTTSInstance;
}


/**
 * 便捷方法：朗读文本
 * @param {string} text - 要朗读的文本
 * @param {Object} options - 选项
 */
export function speak(text, options = {}) {
    if (!globalTTSInstance) {
        console.warn('TTS not initialized, initializing with default options');
        initNativeTTS();
    }
    
    return globalTTSInstance.speak(text, options);
}

/**
 * 便捷方法：朗读选中文本
 */
export function speakSelection() {
    if (!globalTTSInstance) {
        initNativeTTS({ autoShow: true });
    }
    
    return globalTTSInstance.speakSelection();
}

/**
 * 便捷方法：显示 TTS 面板
 */
export function showTTSPanel() {
    if (!globalTTSInstance) {
        initNativeTTS({ autoShow: true });
    } else {
        globalTTSInstance.show();
    }
}

/**
 * 检查 TTS 可用性
 * @returns {boolean} 是否支持 TTS
 */
export function isTTSSupported() {
    return !!(window.nativeTTSBridge || window.speechSynthesis);
}

/**
 * 等待 TTS 就绪
 * @returns {Promise} Promise 对象
 */
export function waitForTTSReady() {
    return new Promise((resolve) => {
        if (window.nativeTTSBridge) {
            resolve(true);
        } else {
            const handler = () => {
                window.removeEventListener('nativeTTSBridgeReady', handler);
                resolve(true);
            };
            
            window.addEventListener('nativeTTSBridgeReady', handler);
            
            // 超时处理
            setTimeout(() => {
                window.removeEventListener('nativeTTSBridgeReady', handler);
                resolve(false);
            }, 5000);
        }
    });
}

// 导出类
export { SSMLBuilder, TTSController, TTSUI };

// 默认导出
export default {
    initNativeTTS,
    getTTSInstance,
    speak,
    speakSelection,
    showTTSPanel,
    isTTSSupported,
    waitForTTSReady,
    SSMLBuilder,
    TTSController,
    TTSUI
};
