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

    // 查找页面上的回复框
    function isPostEditorPage() {
        const editorSelector = ['textarea[name="post_content"]'];
        return editorSelector.some(selector => document.querySelector(selector) !== null);
    }

    // 获取被回复楼层的内容
    async function getQuotedPostContent() {
        // 检查是否是回复页面
        const urlParams = new URLSearchParams(window.location.search);
        const article = urlParams.get('article');
        
        if (!article) return null;
        
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
        
        // 新增按钮
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
        
        // 按钮放到工具栏上
        toolbar.appendChild(aiButton);
    }

    // AO润色
    async function enhancePostContent(editor) {
        // 获取当前输入内容
        const originalContent = editor.value.trim();

        // 如果没有内容，弹出提示
        if (!originalContent) {
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
                // 获取被回复的楼层内容
                const quotedContent = await getQuotedPostContent();
                console.log(`当前回复的楼层的内容是：${quotedContent}`)
                
                // 创建分隔符
                const sepText='\n\n=====================以下是润色后的回复===================\n\n'
                
                // 添加分隔符
                editor.value += sepText;
                
                // 调用LLM API，处理文本（流式输出）
                await callAIEnhancementAPIStream(originalContent, quotedContent, apiKey, (chunk) => {
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
        
        // 构造消息上下文
        const messages = [
            {
                role: "system",
                content: `你是一个专业的中文文案编辑，你的任务是润色和改进用户提供的文本，使其更加流畅、专业和易读，同时保持原意不变。请直接返回修改后的文本，不要添加任何解释或额外内容。`
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