/**
 * Native TTS Controller
 * 负责与 iOS native TTS bridge 通信，管理 TTS 状态和控制播放
 */

import { SSMLBuilder } from './ssml-builder.js';
import './bridge.js'; // 导入 bridge 初始化代码

export class TTSController {
    constructor() {
        this.ssmlBuilder = new SSMLBuilder();
        
        // TTS 状态
        this.state = {
            isPlaying: false,
            isPaused: false,
            isLoading: false,
            currentText: '',
            currentSegment: 0,
            totalSegments: 0,
            progress: 0,
            error: null
        };
        
        // 配置选项
        this.options = {
            language: 'zh-CN',
            rate: '100%',
            pitch: '0Hz',
            volume: '100%',
            voice: null,
            autoDetectLanguage: true,
            enableSentenceBreaks: true,
            segmentMaxLength: 500
        };
        
        // 事件监听器
        this.listeners = new Map();
        
        // 当前播放的文本队列
        this.textQueue = [];
        this.currentQueueIndex = 0;
        
        this.initBridge();
    }

    /**
     * 初始化 native bridge
     */
    initBridge() {
        // 等待 native bridge 就绪
        if (window.nativeTTSBridge) {
            this.setupEventListeners();
        } else {
            window.addEventListener('nativeTTSBridgeReady', () => {
                this.setupEventListeners();
            });
        }
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 监听 native TTS 事件
        window.addEventListener('nativeTTSEvent', (event) => {
            this.handleNativeEvent(event.detail);
        });
        
        // 请求可用语音列表
        this.requestVoices();
    }

    /**
     * 处理来自 native 的事件
     * @param {Object} detail - 事件详情
     */
    handleNativeEvent(detail) {
        const { type, data } = detail;
        
        switch (type) {
            case 'stateChanged':
                this.updateState(data);
                break;
                
            case 'progress':
                this.state.progress = data.progress || 0;
                this.emit('progress', this.state.progress);
                break;
                
            case 'segmentStart':
                this.state.currentText = data.text || '';
                this.state.currentSegment = data.index || 0;
                this.state.totalSegments = data.total || 0;
                this.emit('segmentStart', {
                    text: this.state.currentText,
                    segment: this.state.currentSegment,
                    total: this.state.totalSegments
                });
                break;
                
            case 'wordHighlight':
                this.emit('wordHighlight', data);
                break;
                
            case 'voicesAvailable':
                this.emit('voicesAvailable', data.voices || []);
                break;
                
            case 'finished':
                this.state.isPlaying = false;
                this.state.isPaused = false;
                this.state.progress = 1.0;
                this.emit('finished');
                break;
                
            case 'pause':
                this.state.isPaused = true;
                this.state.isPlaying = false;
                this.emit('pause');
                break;
                
            case 'resume':
                this.state.isPaused = false;
                this.state.isPlaying = true;
                this.emit('resume');
                break;
                
            case 'stop':
                this.resetState();
                this.emit('stop');
                break;
        }
    }

    /**
     * 更新状态
     * @param {Object} data - 状态数据
     */
    updateState(data) {
        const { state: newState, message, currentSegment, totalSegments } = data;
        
        // 重置所有状态标志
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.isLoading = false;
        this.state.error = null;
        
        switch (newState) {
            case 'loading':
                this.state.isLoading = true;
                break;
            case 'playing':
                this.state.isPlaying = true;
                if (typeof currentSegment !== 'undefined') {
                    this.state.currentSegment = currentSegment;
                }
                if (typeof totalSegments !== 'undefined') {
                    this.state.totalSegments = totalSegments;
                }
                break;
            case 'paused':
                this.state.isPaused = true;
                break;
            case 'error':
                this.state.error = message || '播放出错';
                break;
        }
        
        this.emit('stateChange', { ...this.state });
    }

    /**
     * 重置状态
     */
    resetState() {
        this.state = {
            isPlaying: false,
            isPaused: false,
            isLoading: false,
            currentText: '',
            currentSegment: 0,
            totalSegments: 0,
            progress: 0,
            error: null
        };
    }

    /**
     * 播放文本
     * @param {string} text - 要播放的文本
     * @param {Object} options - 播放选项
     */
    async speak(text, options = {}) {
        if (!text || !text.trim()) {
            console.warn('TTS: No text provided');
            return;
        }

        if (!window.nativeTTSBridge) {
            console.error('TTS: Native bridge not available');
            this.emit('error', 'TTS 功能不可用');
            return;
        }

        // 合并选项
        const mergedOptions = { ...this.options, ...options };
        
        try {
            // 检测语言
            if (mergedOptions.autoDetectLanguage) {
                mergedOptions.language = this.ssmlBuilder.detectLanguage(text);
                
                // 根据语言调整默认参数
                const langDefaults = this.ssmlBuilder.getLanguageDefaults(mergedOptions.language);
                Object.assign(mergedOptions, langDefaults, options); // options 优先级更高
            }
            
            // 分段处理长文本
            const segments = this.ssmlBuilder.segmentLongText(text, mergedOptions.segmentMaxLength);
            this.textQueue = segments;
            this.currentQueueIndex = 0;
            
            // 播放第一段
            await this.speakSegment(segments[0], mergedOptions);
            
        } catch (error) {
            console.error('TTS: Failed to speak text:', error);
            this.emit('error', error.message || '播放失败');
        }
    }

    /**
     * 播放文本段
     * @param {string} text - 文本段
     * @param {Object} options - 选项
     */
    async speakSegment(text, options) {
        let processedText = text;
        
        // 添加句子停顿
        if (options.enableSentenceBreaks) {
            processedText = this.ssmlBuilder.addSentenceBreaks(processedText);
        }
        
        // 构建 SSML
        const ssml = this.ssmlBuilder.build(processedText, options);
        
        if (!ssml) {
            console.warn('TTS: Empty SSML generated');
            return;
        }
        
        // 发送到 native
        window.nativeTTSBridge.speak(ssml);
    }

    /**
     * 暂停播放
     */
    pause() {
        if (!window.nativeTTSBridge) return;
        
        if (this.state.isPlaying) {
            window.nativeTTSBridge.pause();
        }
    }

    /**
     * 继续播放
     */
    resume() {
        if (!window.nativeTTSBridge) return;
        
        if (this.state.isPaused) {
            window.nativeTTSBridge.resume();
        }
    }

    /**
     * 停止播放
     */
    stop() {
        if (!window.nativeTTSBridge) return;
        
        window.nativeTTSBridge.stop();
        this.textQueue = [];
        this.currentQueueIndex = 0;
    }

    /**
     * 下一段
     */
    skipNext() {
        if (!window.nativeTTSBridge) return;
        
        window.nativeTTSBridge.skipNext();
    }

    /**
     * 上一段
     */
    skipPrevious() {
        if (!window.nativeTTSBridge) return;
        
        window.nativeTTSBridge.skipPrevious();
    }

    /**
     * 切换播放状态
     */
    toggle() {
        if (this.state.isPlaying) {
            this.pause();
        } else if (this.state.isPaused) {
            this.resume();
        }
    }

    /**
     * 请求可用语音列表
     */
    requestVoices() {
        if (window.nativeTTSBridge) {
            window.nativeTTSBridge.getVoices();
        }
    }

    /**
     * 设置播放选项
     * @param {Object} newOptions - 新选项
     */
    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this.emit('optionsChanged', this.options);
    }

    /**
     * 获取当前选项
     * @returns {Object} 当前选项
     */
    getOptions() {
        return { ...this.options };
    }

    /**
     * 获取当前状态
     * @returns {Object} 当前状态
     */
    getState() {
        return { ...this.state };
    }

    /**
     * 添加事件监听器
     * @param {string} event - 事件名
     * @param {Function} callback - 回调函数
     */
    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * 移除事件监听器
     * @param {string} event - 事件名
     * @param {Function} callback - 回调函数
     */
    removeEventListener(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * 触发事件
     * @param {string} event - 事件名
     * @param {*} data - 事件数据
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`TTS: Error in event callback for ${event}:`, error);
                }
            });
        }
    }

    /**
     * 销毁控制器
     */
    destroy() {
        this.stop();
        this.listeners.clear();
        
        // 移除事件监听器
        window.removeEventListener('nativeTTSEvent', this.handleNativeEvent);
    }
}
