document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM完全加载');
    
    // 获取DOM元素
    const proxyForm = document.getElementById('proxyForm');
    const resultContainer = document.getElementById('resultContainer');
    const resultCardTemplate = document.getElementById('resultCardTemplate');
    
    // 检查QRCode库是否正确加载
    if (typeof QRCode === 'undefined') {
        console.error('QRCode库未正确加载！');
        alert('QRCode库加载失败，请检查网络连接或刷新页面重试！');
    } else {
        console.log('QRCode库已加载');
    }
    
    // 创建操作按钮容器
    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.className = 'action-buttons-container d-none text-center my-4';
    
    // 添加打印所有按钮
    const printAllBtn = document.createElement('button');
    printAllBtn.className = 'btn btn-primary btn-lg mx-2';
    printAllBtn.innerHTML = '<i class="bi bi-printer-fill me-2"></i>打印所有二维码';
    printAllBtn.addEventListener('click', function() {
        window.print();
    });
    actionButtonsContainer.appendChild(printAllBtn);
    

    
    // 表单提交事件
    if (proxyForm) {
        proxyForm.addEventListener('submit', function(e) {
            console.log('表单提交');
            e.preventDefault();
            
            // 更新查询间隔设置
            const intervalInput = document.getElementById('queryInterval');
            if (intervalInput) {
                queryInterval = parseInt(intervalInput.value) || 1500;
                console.log(`设置查询间隔为: ${queryInterval}ms`);
            }
            
            processProxyStrings();
        });
    } else {
        console.error('未找到表单元素！');
    }
    
    // 处理多行代理字符串
    function processProxyStrings() {
        // 获取输入的代理字符串（多行）
        const proxyStringsInput = document.getElementById('proxyString').value.trim();
        
        if (!proxyStringsInput) {
            alert('请输入代理服务器信息！');
            return;
        }
        
        // 按行分割
        const proxyStrings = proxyStringsInput.split('\n');
        console.log(`检测到 ${proxyStrings.length} 个代理信息`);
        
        // 清空结果容器
        resultContainer.innerHTML = '';
        
        // 移除之前的操作按钮容器（如果存在）
        const oldActionButtons = document.querySelector('.action-buttons-container');
        if (oldActionButtons) {
            oldActionButtons.remove();
        }
        
        // 显示加载中提示
        const loadingElement = document.createElement('div');
        loadingElement.className = 'text-center my-4 w-100';
        loadingElement.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div><p class="mt-2">正在生成二维码，请稍候...</p>';
        resultContainer.appendChild(loadingElement);
        
        // 使用setTimeout让UI先更新
        setTimeout(() => {
            // 处理每一行
            let validCount = 0;
            let validProxies = [];
            
            // 先验证所有代理信息
            for (let i = 0; i < proxyStrings.length; i++) {
                const proxyString = proxyStrings[i].trim();
                if (proxyString) {
                    const proxyData = validateProxyString(proxyString, i + 1);
                    if (proxyData) {
                        validProxies.push(proxyData);
                        validCount++;
                    }
                }
            }
            
            // 移除加载提示
            resultContainer.removeChild(loadingElement);
            
            // 批量生成二维码
            if (validCount > 0) {
                // 创建一个文档片段，提高性能
                const fragment = document.createDocumentFragment();
                
                // 生成所有二维码
                validProxies.forEach((proxy, index) => {
                    const resultCard = createQRCodeCard(proxy, index + 1);
                    fragment.appendChild(resultCard);
                    
                    // 查询IP地理位置信息
                    queryIpLocation(proxy.ip, resultCard.querySelector('.ip-source'));
                });
                
                // 一次性添加到DOM
                resultContainer.appendChild(fragment);
                
                // 添加操作按钮容器到结果容器后面
                resultContainer.after(actionButtonsContainer);
                actionButtonsContainer.classList.remove('d-none');
                
                // 滚动到结果区域
                setTimeout(() => {
                    resultContainer.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } else {
                const noResultElement = document.createElement('div');
                noResultElement.className = 'alert alert-warning w-100';
                noResultElement.textContent = '没有找到有效的代理信息，请检查输入格式是否正确！';
                resultContainer.appendChild(noResultElement);
                
                // 隐藏操作按钮容器
                actionButtonsContainer.classList.add('d-none');
            }
        }, 100);
    }
    

    

    
    // IP地理位置查询队列管理
    let ipQueryQueue = [];
    let isProcessingQueue = false;
    let queryInterval = 1500; // 1.5秒间隔，避免请求过于频繁
    let maxConcurrentQueries = 1; // 最大并发查询数
    
    // 查询IP地理位置信息
    function queryIpLocation(ip, displayElement) {
        // 检查是否是私有IP
        if (isPrivateIP(ip)) {
            displayElement.textContent = '内网IP';
            displayElement.classList.add('text-secondary');
            return;
        }
        
        // 将查询请求添加到队列
        ipQueryQueue.push({
            ip: ip,
            displayElement: displayElement,
            retryCount: 0,
            maxRetries: 2
        });
        
        // 如果队列没有在处理，开始处理
        if (!isProcessingQueue) {
            processIpQueryQueue();
        }
    }
    
    // 处理IP查询队列
    async function processIpQueryQueue() {
        if (isProcessingQueue || ipQueryQueue.length === 0) {
            return;
        }
        
        isProcessingQueue = true;
        
        while (ipQueryQueue.length > 0) {
            const query = ipQueryQueue.shift();
            await performIpQueryWithRetry(query); // 串行阻塞重试
            // 添加间隔，避免请求过于频繁
            if (ipQueryQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, queryInterval));
            }
        }
        
        isProcessingQueue = false;
    }

    // 串行重试的IP查询
    async function performIpQueryWithRetry(query) {
        const { ip, displayElement, maxRetries = 2 } = query;
        let attempt = 0;
        while (attempt <= maxRetries) {
            try {
                await performSingleIpQuery(ip, displayElement);
                return; // 成功则直接返回
            } catch (error) {
                attempt++;
                console.error(`查询IP ${ip} 失败 (第${attempt}次):`, error);
                if (attempt > maxRetries) {
                    displayElement.textContent = '查询失败';
                    displayElement.classList.remove('text-info', 'text-success');
                    displayElement.classList.add('text-warning');
                    return;
                }
                // 重试前等待递增延迟
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }

    // 单次IP查询（无重试）
    async function performSingleIpQuery(ip, displayElement) {
        // 显示查询状态
        displayElement.textContent = '查询中...';
        displayElement.classList.remove('text-success', 'text-warning');
        displayElement.classList.add('text-info');
        
        const response = await fetch(`https://qifu-api.baidubce.com/ip/geo/v1/district?ip=${ip}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data && data.code === "Success" && data.data) {
            // 构建位置信息
            let locationInfo = [];
            if (data.data.country) locationInfo.push(data.data.country);
            if (data.data.prov) locationInfo.push(data.data.prov);
            if (data.data.city) locationInfo.push(data.data.city);
            if (data.data.district) locationInfo.push(data.data.district);
            const locationText = locationInfo.join(' · ');
            if (locationText) {
                displayElement.textContent = locationText;
                displayElement.classList.remove('text-info', 'text-warning');
                displayElement.classList.add('text-success');
                // 保存位置信息到代理数据中
                const card = displayElement.closest('.result-card');
                if (card) {
                    card.dataset.ipLocation = locationText;
                }
            } else {
                displayElement.textContent = '未知位置';
                displayElement.classList.remove('text-info', 'text-success');
                displayElement.classList.add('text-warning');
            }
        } else {
            throw new Error('API返回数据格式错误');
        }
    }
    
    
    
    // 检查是否是私有IP
    function isPrivateIP(ip) {
        // 简单判断常见的内网IP段
        return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(ip);
    }
    
    // 验证代理字符串并返回解析后的数据
    function validateProxyString(proxyString, index) {
        try {
            // 解析代理字符串 (格式: ip:端口:用户名:密码)
            const parts = proxyString.split(':');
            
            if (parts.length !== 4) {
                console.error(`第 ${index} 个代理信息格式不正确: ${proxyString}`);
                return null;
            }
            
            const ip = parts[0];
            const port = parts[1];
            const username = parts[2];
            const password = parts[3];
            
            // 验证各部分不为空
            if (!ip || !port || !username || !password) {
                console.error(`第 ${index} 个代理信息的各部分不能为空: ${proxyString}`);
                return null;
            }
            
            // 构造代理字符串用于生成二维码
            const socksString = `${username}:${password}@${ip}:${port}`;
            
            // Base64编码
            const base64Value = btoa(socksString);
            
            // 构造完整的socks URL
            const socksUrl = `socks://${base64Value}`;
            
            return {
                index: index,
                ip: ip,
                port: port,
                username: username,
                password: password,
                socksUrl: socksUrl
            };
        } catch (error) {
            console.error(`处理第 ${index} 个代理信息时出错:`, error);
            return null;
        }
    }
    
    // 创建二维码卡片
    function createQRCodeCard(proxyData, index) {
        // 克隆模板
        const resultCard = document.importNode(resultCardTemplate.content, true).firstElementChild;
        
        // 设置IP地址作为标题
        resultCard.querySelector('.ip-address-title').textContent = proxyData.ip;
        
        // 生成二维码
        const qrcodeContainer = resultCard.querySelector('.qrcode-container');
        
        new QRCode(qrcodeContainer, {
            text: proxyData.socksUrl,
            width: 150,
            height: 150,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        
        // 显示代理信息
        resultCard.querySelector('.display-ip').textContent = proxyData.ip;
        resultCard.querySelector('.display-port').textContent = proxyData.port;
        resultCard.querySelector('.display-username').textContent = proxyData.username;
        resultCard.querySelector('.display-password').textContent = proxyData.password;
        
        // 添加保存二维码事件
        resultCard.querySelector('.save-qrcode').addEventListener('click', function() {
            saveQRCode(this.closest('.result-card').querySelector('.qrcode-container img'), proxyData);
        });
        

        
        return resultCard;
    }
    

    

    
    // 保存二维码图片
    function saveQRCode(qrcodeImg, proxyData) {
        if (!qrcodeImg) {
            alert('二维码图片不存在！');
            return;
        }
        
        try {
            // 创建一个临时画布
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            // 设置画布大小
            canvas.width = qrcodeImg.width;
            canvas.height = qrcodeImg.height;
            
            // 在画布上绘制二维码图像
            context.drawImage(qrcodeImg, 0, 0, qrcodeImg.width, qrcodeImg.height);
            
            // 将画布内容转换为数据URL
            const dataURL = canvas.toDataURL('image/png');
            
            // 创建下载链接
            const downloadLink = document.createElement('a');
            downloadLink.href = dataURL;
            
            // 获取IP位置信息（如果有）
            const card = qrcodeImg.closest('.result-card');
            const ipLocation = card ? card.dataset.ipLocation || '' : '';
            
            // 使用代理信息作为文件名，添加IP位置信息
            const fileName = `proxy-${ipLocation ? ipLocation + '-' : ''}${proxyData.ip}-${proxyData.port}.png`;
            downloadLink.download = fileName;
            
            // 模拟点击下载链接
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch (error) {
            console.error('保存二维码时出错:', error);
            alert('保存二维码时出错，请重试！');
        }
    }
}); 