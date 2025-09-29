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
        renderer = null,
        autoShow = false,
        ...ttsOptions
    } = options;

    if (globalTTSInstance) {
        console.warn('TTS already initialized, returning existing instance');
        return globalTTSInstance;
    }

    // 创建控制器，传递renderer参数
    const controller = new TTSController(renderer);
    
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
        textManager: controller.textManager,

        // 快捷方法
        speak: (text, options) => controller.speak(text, options),
        pause: () => controller.pause(),
        resume: () => controller.resume(),
        stop: () => controller.stop(),
        toggle: () => controller.toggle(),
        
        // 新增：从当前位置朗读相关方法
        speakFromCurrentPosition: (options) => 
            controller.speakFromCurrentPosition(options),
        speakFromSentence: (sentenceIndex, options) => 
            controller.speakFromSentence(sentenceIndex, options),
        playNextSentence: () => controller.playNextSentence(),
        playPreviousSentence: () => controller.playPreviousSentence(),
        jumpToSentence: (index) => controller.jumpToSentence(index),
        
        // TTS数据管理相关方法
        refreshTTSData: () => controller.refreshTTSData(),
        isTTSDataReady: () => controller.isTTSDataReady(),
        getTTSSentences: () => controller.getTTSSentences(),
        getCurrentReadingWordIndex: () => controller.getCurrentReadingWordIndex(),
        
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

    globalTTSInstance = instance;
    return instance;
}

// 导出类
export { SSMLBuilder, TTSController, TTSUI };

// 默认导出
export default {
    initNativeTTS,
    SSMLBuilder,
    TTSController,
    TTSUI
};
