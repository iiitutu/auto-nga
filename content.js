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
                // 调用LLM API，处理文本
                const enhancedContent = await callAIEnhancementAPI(originalContent, apiKey);
                
                // 文本替换
                editor.value = enhancedContent;
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

    // 调用LLM API，处理文本
    async function callAIEnhancementAPI(content, apiKey) {
        const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "你是一个专业的中文文案编辑，你的任务是润色和改进用户提供的文本，使其更加流畅、专业和易读，同时保持原意不变。请直接返回修改后的文本，不要添加任何解释或额外内容。"
                    },
                    {
                        role: "user",
                        content: `请润色以下文本：${content}`
                    }
                ],
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content.trim();
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