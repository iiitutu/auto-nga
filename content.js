// ==UserScript==
// @name         NGA Forum Enhancer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Enhance NGA forum with AI-powered post editing
// @author       You
// @match        *://bbs.nga.cn/*
// @match        *://nga.178.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 默认设置
    const DEFAULT_SETTINGS = {
        tone: 'nga', // nga, zhihu, rednote, tieba, tiktok
        attitude: 'neutral',  // family, friendly, neutral, negative, enemy
        verbosity: 'high'   // lower, low, medium, high, higher
    };

    // 提取回复块的函数
    function extractReplyBlocks(content) {
        const replyBlockRegex = /\[b\][\s\S]*?\[\/b\]/g;        
        const replyBlocks = content.match(replyBlockRegex) || [''];
        // 移除回复块后的内容（保留其他文本）
        const remainingContent = content.replace(replyBlockRegex, '');
        return {replyBlocks, remainingContent};
    }

    // 查找页面上的回复框
    function isPostEditorPage() {
        const editorSelector = ['textarea[name="post_content"]'];
        return editorSelector.some(selector => document.querySelector(selector) !== null);
    }

    // 获取被回复楼层的内容
    async function getQuotedPostContent() {
        // 检查是否是回复页面
        const urlParams = new URLSearchParams(window.location.search);
        let article = urlParams.get('article');
        
        if (!article) article = 0;
        
        // 构造原帖URL以获取内容
        const tid = urlParams.get('tid');
        if (!tid) return null;
        
        try {
            // 计算楼层所在的页数（每页20层，第一页1-19，第二页20-39，以此类推）
            const postsPerPage = 20;
            let pageNumber;
            if (article < 20) {
                pageNumber = 1; // 第一页是1-19层
            } else {
                pageNumber = Math.floor((article - 1) / postsPerPage) + 1; // 从第20层开始按20层每页计算
            }
            
            // 发送请求获取原帖页面
            const response = await fetch(`https://bbs.nga.cn/read.php?tid=${tid}&page=${pageNumber}`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html'
                }
            });
            
            if (!response.ok) return null;

            // 使用GBK解码器
            const arrayBuffer = await response.arrayBuffer();
            const decoder = new TextDecoder('gbk');
            const html = decoder.decode(arrayBuffer);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 查找对应的楼层
            const postId = `postcontent${article}`;
            const postElement = doc.getElementById(postId);
            
            if (postElement) {
                // 提取纯文本内容并清理
                let content = postElement.textContent || postElement.innerText;
                // 移除可能的多余空白字符
                content = content.replace(/\s+/g, ' ').trim();
                return content;
            }
        } catch (error) {
            console.error('获取被回复内容失败:', error);
        }
        
        return null;
    }

    // 增加AI润色按钮
    function addAIButton() {
        if (!isPostEditorPage()) return;

        // 找到页面上的回复框
        const editorSelector = ['textarea[name="post_content"]'];
        let editor = document.querySelector(editorSelector);
        
        if (!editor) return;

        // 找到放AI润色按钮的工具栏
        let toolbar = document.querySelector('.c2') 
        
        // 如果没找到，创造一个
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'ai-enhancer-toolbar';
            toolbar.style.cssText = `
                margin-bottom: 10px;
                padding: 5px;
                border: 1px solid #ccc;
                border-radius: 3px;
            `;
            
            // 插入工具栏
            editor.parentNode.insertBefore(toolbar, editor);
        }
        
        // 检查是否已有按钮
        if (document.getElementById('ai-enhance-btn')) return;
        
        // 新增AI润色按钮
        const aiButton = document.createElement('button');
        aiButton.id = 'ai-enhance-btn';
        aiButton.textContent = 'AI润色';
        aiButton.style.cssText = `
            padding: 5px 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            margin-right: 5px;
        `;
        
        // 点击事件
        aiButton.addEventListener('click', function() {
            enhancePostContent(editor);
        });
        
        // 添加设置按钮
        const settingsButton = document.createElement('button');
        settingsButton.id = 'ai-settings-btn';
        settingsButton.textContent = '⚙️';
        settingsButton.title = 'AI设置';
        settingsButton.style.cssText = `
            padding: 5px 10px;
            background-color: #2196F3;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        `;
        
        // 点击事件
        settingsButton.addEventListener('click', function() {
            showSettingsPopup();
        });
        
        // 按钮放到工具栏上
        toolbar.appendChild(aiButton);
        toolbar.appendChild(settingsButton);
        
        // 创建设置弹窗
        createSettingsPopup();
    }

    // 创建设置弹窗
    function createSettingsPopup() {
        // 如果弹窗已存在则不重复创建
        if (document.getElementById('ai-settings-popup')) return;
        
        const popup = document.createElement('div');
        popup.id = 'ai-settings-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 300px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 10000;
            padding: 20px;
            display: none;
        `;
        
        popup.innerHTML = `
            <h3 style="margin-top: 0;">AI润色设置</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">风格:</label>
                <select id="ai-tone-select" style="width: 100%; padding: 5px;">
                    <option value="nga">NGA</option>
                    <option value="zhihu">知乎</option>
                    <option value="rednote">小红书</option>
                    <option value="tieba">贴吧</option>
                    <option value="tiktok">抖音</option>
                </select>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">态度:</label>
                <select id="ai-attitude-select" style="width: 100%; padding: 5px;">
                    <option value="family">极度友好</option>
                    <option value="friendly">友好</option>
                    <option value="neutral">中性</option>
                    <option value="negative">不友好</option>
                    <option value="enemy">极度不友好</option>
                </select>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">详细程度:</label>
                <select id="ai-verbosity-select" style="width: 100%; padding: 5px;">
                    <option value="lower">极度简洁</option>
                    <option value="low">简洁</option>
                    <option value="medium">适中</option>
                    <option value="high">详细</option>
                    <option value="higher">极度详细</option>
                </select>
            </div>
            <div style="text-align: right;">
                <button id="ai-settings-cancel" style="padding: 5px 10px; margin-right: 10px; background: #ccc; border: none; border-radius: 3px; cursor: pointer;">取消</button>
                <button id="ai-settings-save" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">保存</button>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // 添加关闭弹窗的事件
        document.getElementById('ai-settings-cancel').addEventListener('click', function() {
            popup.style.display = 'none';
        });
        
        // 添加保存设置的事件
        document.getElementById('ai-settings-save').addEventListener('click', function() {
            saveSettings();
            popup.style.display = 'none';
        });
        
        // 点击弹窗外关闭弹窗
        popup.addEventListener('click', function(e) {
            if (e.target === popup) {
                popup.style.display = 'none';
            }
        });
    }

    // 显示设置弹窗
    function showSettingsPopup() {
        const popup = document.getElementById('ai-settings-popup');
        if (!popup) return;
        
        // 加载当前设置
        loadSettings(function(settings) {
            document.getElementById('ai-tone-select').value = settings.tone;
            document.getElementById('ai-attitude-select').value = settings.attitude;
            document.getElementById('ai-verbosity-select').value = settings.verbosity;
        });
        
        popup.style.display = 'block';
    }

    // 加载设置
    function loadSettings(callback) {
        chrome.storage.local.get(['aiEnhancerSettings'], function(result) {
            const settings = result.aiEnhancerSettings || DEFAULT_SETTINGS;
            callback(settings);
        });
    }

    // 保存设置
    function saveSettings() {
        const settings = {
            tone: document.getElementById('ai-tone-select').value,
            attitude: document.getElementById('ai-attitude-select').value,
            verbosity: document.getElementById('ai-verbosity-select').value
        };
        
        chrome.storage.local.set({aiEnhancerSettings: settings}, function() {
            // 设置保存成功提示
            const toolbar = document.querySelector('.ai-enhancer-toolbar');
            if (toolbar) {
                const message = document.createElement('span');
                message.textContent = '设置已保存';
                message.style.cssText = `
                    color: green;
                    font-size: 12px;
                    margin-left: 10px;
                `;
                toolbar.appendChild(message);
                
                // 2秒后移除提示
                setTimeout(() => {
                    if (message.parentNode) {
                        message.parentNode.removeChild(message);
                    }
                }, 2000);
            }
        });
    }

    // AI润色
    async function enhancePostContent(editor) {
        // 获取当前输入内容
        const originalContent = editor.value;

        // 如果没有内容，弹出提示
        if (!originalContent.trim()) {
            alert('请先输入回帖内容');
            return;
        }
        
        // 浏览器storage提取api key
        chrome.storage.local.get(['ngaApiKey'], async function(result) {
            const apiKey = result.ngaApiKey;
            if (!apiKey) {
                alert('请先在扩展弹窗中设置API密钥');
                return;
            }
            
            // AI处理时禁用按钮
            const aiButton = document.getElementById('ai-enhance-btn');
            const originalText = aiButton.textContent;
            aiButton.textContent = '处理中...';
            aiButton.disabled = true;
            
            try {
                // 提取回复块
                let { replyBlocks, remainingContent } = extractReplyBlocks(originalContent);
                console.log(`回复代码：${replyBlocks[0]}`)

                // 创建分隔符
                const sepText='\n\n=====================以下是润色后的回复===================\n\n'

                // 如果已有润色内容，则只看原文
                remainingContent = remainingContent.split(sepText)[0] 
                console.log(`待润色的回复内容：${remainingContent}`)


                // 获取被回复的楼层内容
                const quotedContent = await getQuotedPostContent();
                console.log(`当前回复的楼层的内容是：${quotedContent}`)
                
                // 添加分隔符和回复块
                editor.value += sepText + replyBlocks[0];
                
                // 调用LLM API，处理文本（流式输出）
                await callAIEnhancementAPIStream(remainingContent, quotedContent, apiKey, (chunk) => {
                    // 流式输出到编辑器
                    editor.value += chunk;
                    // 自动滚动到底部
                    editor.scrollTop = editor.scrollHeight;
                });
            } catch (error) {
                console.error('AI增强失败:', error);
                alert('AI增强失败: ' + error.message);
            } finally {
                // 重新启用按钮
                aiButton.textContent = originalText;
                aiButton.disabled = false;
            }
        });
    }

    // 调用LLM API，处理文本（流式输出）
    async function callAIEnhancementAPIStream(content, quotedContent, apiKey, onChunk) {
        const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
        
        // 获取设置
        chrome.storage.local.get(['aiEnhancerSettings'], function(result) {
            const settings = result.aiEnhancerSettings || DEFAULT_SETTINGS;
            
            // 根据设置生成系统提示
            const systemPrompt = generateSystemPrompt(settings);
            console.log(systemPrompt)
            
            // 构造消息上下文
            const messages = [
                {
                    role: "system",
                    content: systemPrompt
                }
            ];
            
            // 如果有被引用的内容，添加到上下文中
            if (quotedContent) {
                messages.push({
                    role: "user",
                    content: `以下是需要回复的原帖内容：${quotedContent}`
                });
            }
            
            // 添加用户需要润色的内容
            messages.push({
                role: "user",
                    content: `请润色以下回复文本：${content}`
                });
                
                // 继续执行API调用
                performAPIRequest(apiUrl, messages, apiKey, onChunk);
            });
        }
        
        // 生成系统提示
        function generateSystemPrompt(settings) {
            let prompt = "你是一个专业的中文文案编辑，你的任务是润色和改进用户提供的文本，使其更加流畅、专业和易读，同时保持原意不变。";
            
            // 根据语气设置调整
            switch(settings.tone) {
                case 'nga':
                    prompt += "请使用标志性的NGA论坛（艾泽拉斯国家地理论坛）风格。";
                    break;
                case 'zhihu':
                    prompt += "请使用标志性的知乎风格。";
                    break;
                case 'rednote':
                    prompt += "请使用标志性的小红书风格。";
                    break;
                case 'tieba':
                    prompt += "请使用标志性的贴吧风格。"
                    break;
                case 'tiktok':
                    prompt += "请使用标志性的抖音风格。"
                    break
            }
            
            // 根据态度设置调整
            switch(settings.attitude) {
                case 'family':
                    prompt += "请保持极度友好、友善的态度。";
                    break;
                case 'friendly':
                    prompt += "请保持较为友好、亲切的态度。";
                    break;
                case 'neutral':
                    prompt += "请保持中性、客观的态度。";
                    break;
                case 'negative':
                    prompt += "请保持不太友好，较为消极的态度。";
                    break;
                case 'enemy':
                    prompt += "请保持极度具有攻击性、极度不友好的态度。";
                    break;

            }
            
            // 根据详细程度设置调整
            switch(settings.verbosity) {
                case 'lower':
                    prompt += "请保持极度简洁，没有一丁点废话，避免冗余信息。";
                    break;
                case 'low':
                    prompt += "请保持简洁明了，避免冗余。";
                    break;
                case 'medium':
                    prompt += "请在简洁和详细之间取得平衡。";
                    break;
                case 'high':
                    prompt += "请提供详细、全面的内容，有一点啰嗦。";
                    break;
                case 'higher':
                    prompt += "请提供极度详细、全面的内容，尽量啰嗦。";
                    break;
            }
            
            prompt += "请直接返回修改后的文本，不要添加任何解释或额外内容。";
            return prompt;
        }
        
        // 执行API请求
        async function performAPIRequest(apiUrl, messages, apiKey, onChunk) {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: messages,
                    temperature: 0.7,
                    stream: true
                })
            });
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }
            
            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // 按行处理数据
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保留不完整的行
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                onChunk(content);
                            }
                        } catch (e) {
                            console.error('Error parsing stream data:', e);
                        }
                    }
                }
            }
            
            // 处理剩余数据
            if (buffer.startsWith('data: ')) {
                const data = buffer.slice(6);
                if (data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) {
                            onChunk(content);
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
        }
        
        // 初始化
        function init() {
            addAIButton();
        }
        
        // 页面加载后，调用初始化方法
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();