const video = document.getElementById('myVideo');
const vocals = document.getElementById('vocals');
const accompaniment = document.getElementById('accompaniment');
const interruption = document.getElementById('interruption');
const server = localStorage.getItem("server");

let videoReady = false;
let vocalsReady = false;
let accompanimentReady = false;
let vocalsVolume = localStorage.getItem("vocalsVolume")? parseFloat(localStorage.getItem("vocalsVolume")): 1;
let accompanimentVolume = localStorage.getItem("accompanimentVolume")? parseFloat(localStorage.getItem("accompanimentVolume")): 1;
let openSetting = false;
let singsList = [];
let isBindEvent = false;

// 遥控器控制相关变量
let isRemoteControlVisible = false;
let currentFocusIndex = 0;
let controlItems = [];

// 遥控器按键映射
const REMOTE_KEYS = {
    ENTER: 13,      // 确认键
    UP: 38,         // 上
    DOWN: 40,       // 下
    LEFT: 37,       // 左
    RIGHT: 39,      // 右
    BACK: 8,        // 返回键
    MENU: 18        // 菜单键 (Alt)
};

localStorage.setItem('vocalsVolume', vocalsVolume.toString());
localStorage.setItem('accompanimentVolume', accompanimentVolume.toString());
video.volume = 0;
vocals.volume = vocalsVolume;
accompaniment.volume = accompanimentVolume;

getSingList = (flag = false) => {
    $.ajax({
        type: "GET",
        async: flag,
        url: server + "/song/singHistory/pendingAll",
        success: function (data) {
            if (data.code === 0) {
                singsList = data.data;
            } else {
                $.Toast(data.msg, "error");
            }
        }
    })
}

loadSing = (flag=false) => {
    getSingList(false);
    if (singsList.length < 1) {return;}
    let file_name = singsList[0].name;
    let video_name = file_name + ".mp4";
    let vocals_name = file_name + "_vocals.mp3";
    let accompaniment_name = file_name + "_accompaniment.mp3";
    video.src = server + '/download/' + video_name;
    vocals.src = server + '/download/' + vocals_name;
    accompaniment.src = server + '/download/' + accompaniment_name;
    if (flag) {
        video.addEventListener('canplaythrough', () => {videoReady = true; tryPlay();});
        vocals.addEventListener('canplaythrough', () => {vocalsReady = true; tryPlay();});
        accompaniment.addEventListener('canplaythrough', () => {accompanimentReady = true; tryPlay();});
    } else {
        video.addEventListener('canplaythrough', () => {videoReady = true;});
        vocals.addEventListener('canplaythrough', () => {vocalsReady = true;});
        accompaniment.addEventListener('canplaythrough', () => {accompanimentReady = true;});
    }
    showTips();
}

showTips = () => {
    let playinText = "暂未开始播放"
    if (singsList.length > 0) {
        if (singsList[0].is_sing === -1) {
            playinText = "当前播放：" + singsList[0].name;
            if (singsList.length > 1) {
                playinText = playinText + "，下一首：" + singsList[1].name;
            } else {
                playinText = playinText + "，暂无下一首歌曲"
            }
        } else {
            playinText = playinText + "，下一首：" + singsList[0].name;
        }
    } else {
        playinText = playinText + "，暂无下一首歌曲"
    }
    document.getElementById("playing-text").innerText = playinText;
}

tryPlay = () => {
    if (videoReady && vocalsReady && accompanimentReady) {
        video.play().catch(error => {
            console.error("视频播放失败:", error);
            $.Toast("第一次请手动点击播放按钮 ~", "error");
        });
        vocals.play().catch(error => {
            console.error("人声播放失败:", error);
            $.Toast("第一次请手动点击播放按钮 ~", "error");
        });
        accompaniment.play().catch(error => {
            console.error("伴奏播放失败:", error);
            $.Toast("第一次请手动点击播放按钮 ~", "error");
        });
    }
}

// 同步时间
video.addEventListener('timeupdate', () => {
    if (Math.abs(video.currentTime - vocals.currentTime) > 0.2 || Math.abs(accompaniment.currentTime - video.currentTime) > 0.2) {
        vocals.currentTime = video.currentTime;
        accompaniment.currentTime = video.currentTime;
    }
});

// vocals.addEventListener('timeupdate', () => {
//     if (Math.abs(vocals.currentTime - video.currentTime) > 0.2) {
//         video.currentTime = vocals.currentTime;
//         accompaniment.currentTime = vocals.currentTime;
//     }
// });

// accompaniment.addEventListener('timeupdate', () => {
//     if (Math.abs(accompaniment.currentTime - video.currentTime) > 0.2) {
//         video.currentTime = accompaniment.currentTime;
//         vocals.currentTime = accompaniment.currentTime;
//     }
// });

// 暂停和播放事件
video.addEventListener('pause', () => {
    vocals.pause();
    accompaniment.pause();
    send_message(1, 4);
});

video.addEventListener('play', () => {
    setSinging();
    tryPlay();
    send_message(1, 3);
    getSingList(false);
    showTips();
});

video.addEventListener('ended', () => {
    videoReady = false;
    vocalsReady = false;
    accompanimentReady = false;
    nextSong();
});

document.getElementById("switchVocal").addEventListener('click', () => {
    let switch_button = document.getElementById("switchVocal");
    if (switch_button.getElementsByTagName('span')[0].innerText === "原唱") {
        send_message(4, 1);
    } else {
        send_message(4, 0);
    }
})

document.getElementById("next-song").addEventListener('click', () => {send_message(3, 0);})

send_message = (code, data) => {
    $.ajax({
        type: "GET",
        url: server + "/song/send/event?code=" + code + "&data=" + data,
        success: function (data) {
            if (data.code !== 0) {
                $.Toast(data.msg, 'error');
            }
        }
    })
}

switchVocal = (flag) => {
    let switch_button = document.getElementById("switchVocal");
    if (flag === 'ON') {
        switch_button.getElementsByTagName('span')[0].innerText = "原唱"
        switch_button.style.filter = "grayscale(0)";
        vocals.volume = vocalsVolume;
    } else {
        switch_button.getElementsByTagName('span')[0].innerText = "伴奏"
        switch_button.style.filter = "grayscale(1)";
        vocals.volume = 0;
    }
}

first_play = () => {
    if (singsList.length > 0) {
        loadSing();
        tryPlay();
    }
}

nextSong = () => {
    if (singsList.length > 0) {setSinged(false);}
    getSingList(false);
    if (singsList.length < 1) {
        document.getElementById("playing-text").innerText = "当前没有待播放的歌曲，快去点歌吧 ~";
        video.src = "";
        vocals.src = "";
        accompaniment.src = "";
        return;
    }
    singsList.shift();
    loadSing(true);
}

reSing = () => {
    video.currentTime = 0;
    vocals.currentTime = 0;
    accompaniment.currentTime = 0;
    video.play();
}

setSinged = (flag = false) => {
    $.ajax({
        type: "GET",
        async: flag,
        url: server + "/song/setSinged/" + singsList[0].id,
        success: function (data) {
            if (data.code !== 0) {
                $.Toast(data.msg, "error");
            }
        }
    })
}

setSinging = (flag = false) => {
    $.ajax({
        type: "GET",
        async: flag,
        url: server + "/song/setSinging/" + singsList[0].id,
        success: function (data) {
            if (data.code !== 0) {
                $.Toast(data.msg, "error");
            }
        }
    })
}

changeVolume = (volume, flag) => {
    if (flag === 'vocals') {
        vocalsVolume = volume;
        vocals.volume = vocalsVolume;
        localStorage.setItem('vocalsVolume', vocalsVolume.toString());
    } else {
        accompanimentVolume = volume;
        accompaniment.volume = accompanimentVolume;
        localStorage.setItem('accompanimentVolume', accompanimentVolume.toString());
    }
}

initVolume = (eleId) => {
    let mdown = false;
    let progressEle = document.getElementById(eleId);
    let startIndex = progressEle.getBoundingClientRect().left;
    if (eleId === "volume-vocals-progress") {
        vocals.volume = vocalsVolume;
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = vocalsVolume * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = vocalsVolume * 100 + '%';
    } else {
        accompaniment.volume = accompanimentVolume;
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = accompanimentVolume * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = accompanimentVolume * 100 + '%';
    }
    if (isBindEvent) {return;}
    progressEle.getElementsByClassName("mkpgb-dot")[0].addEventListener("mousedown", (e) => {
        e.preventDefault();
    })
    progressEle.addEventListener("mousedown", (e) => {
        mdown = true;
        isBindEvent = true;
        barMove(e);
    })
    progressEle.addEventListener("mousemove", (e) => {
        barMove(e);
    })
    progressEle.addEventListener("mouseup", (e) => {
        if (eleId === "volume-vocals-progress") {send_message(5, vocalsVolume);
        } else {send_message(6, accompanimentVolume);}
        mdown = false;
        isBindEvent = true;
    })
    function barMove(e) {
        if(!mdown) return;
        let percent = 0;
        if(e.clientX < startIndex){
            percent = 0;
        }else if(e.clientX > progressEle.clientWidth + startIndex){
            percent = 1;
        }else{
            percent = (e.clientX - startIndex) / progressEle.clientWidth;
        }
        if (eleId === "volume-vocals-progress") {
            vocalsVolume = percent;
            vocals.volume = vocalsVolume;
            localStorage.setItem('vocalsVolume', vocalsVolume.toString());

        } else {
            accompanimentVolume = percent;
            accompaniment.volume = accompanimentVolume;
            localStorage.setItem('accompanimentVolume', accompanimentVolume.toString());
        }
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = percent * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = percent * 100 + '%';
        return true;
    }
}

userInterruption = (flag) => {
    interruption.src = "/static/file/" + flag + ".mp3";
    interruption.volume = 0.8;
    interruption.play();
}

document.getElementsByClassName("setting-img")[0].addEventListener("click", () => {
    if (openSetting) {
        openSetting = false;
        document.getElementById("expand-img").src = "/static/img/expand.svg";
        document.getElementsByClassName("setting-list")[0].style.display = 'none';
        document.getElementsByClassName("volume-setting")[0].style.display = 'none';
    } else {
        openSetting = true;
        document.getElementById("expand-img").src = "/static/img/pickup.svg";
        document.getElementsByClassName("setting-list")[0].style.display = 'flex';
    }
})

document.getElementById("change-volume").addEventListener("click", () => {
    let volume_setting = document.getElementsByClassName("volume-setting")[0];
    if (volume_setting.style.display === 'flex') {
        volume_setting.style.display = 'none';
        return;
    }
    let volume_list = document.getElementsByClassName("setting")[0].offsetTop;
    volume_setting.style.top = volume_list + 72 + "px";
    volume_setting.style.display = 'flex';
    initVolume("volume-vocals-progress");
    initVolume("volume-acc-progress");
})

window.onload = function() {
    loadSing();
    initRemoteControl();
    generateQRCode();

    const eventSource = new EventSource(server + "/song/events");
    eventSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        switch (message.code) {
            case 1:
                if (message.data === '0') {video.pause();}
                if (message.data === '1') {video.play();}
                if (message.data === '5') {first_play();}
                break;
            case 2:
                reSing();
                break;
            case 3:
                nextSong();
                break;
            case 4:
                if (message.data === '0') {switchVocal("ON");}
                if (message.data === '1') {switchVocal("OFF");}
                break;
            case 5:
                changeVolume(message.data, "vocals");
                break;
            case 6:
                changeVolume(message.data, "accompaniment");
                break;
            case 7:
                userInterruption(message.data);
                break;
            case 8:
                getSingList(false);
                showTips();
                break;
        }
    };
    eventSource.onerror = function(event) {
        console.error("EventSource failed:", event);
        eventSource.close();
    };
};

// 初始化遥控器控制
function initRemoteControl() {
    controlItems = document.querySelectorAll('.control-item');
    
    // 绑定键盘事件
    document.addEventListener('keydown', handleRemoteKeyPress);
    
    // 初始化音量显示
    updateVolumeIndicators();
    
    // 更新播放状态显示
    updatePlayPauseText();
}

// 处理遥控器按键
function handleRemoteKeyPress(e) {
    e.preventDefault();
    
    switch(e.keyCode) {
        case REMOTE_KEYS.ENTER:
            if (isRemoteControlVisible) {
                executeCurrentAction();
            } else {
                showRemoteControl();
            }
            break;
        case REMOTE_KEYS.UP:
            if (isRemoteControlVisible) {
                moveFocusVertical(-1);
            }
            break;
        case REMOTE_KEYS.DOWN:
            if (isRemoteControlVisible) {
                moveFocusVertical(1);
            }
            break;
        case REMOTE_KEYS.LEFT:
            if (isRemoteControlVisible) {
                moveFocusHorizontal(-1);
            }
            break;
        case REMOTE_KEYS.RIGHT:
            if (isRemoteControlVisible) {
                moveFocusHorizontal(1);
            }
            break;
        case REMOTE_KEYS.BACK:
            if (isRemoteControlVisible) {
                hideRemoteControl();
            }
            break;
    }
}

// 显示遥控器控制面板
function showRemoteControl() {
    isRemoteControlVisible = true;
    document.getElementById('remote-control-panel').classList.add('show');
    updateFocus();
}

// 隐藏遥控器控制面板
function hideRemoteControl() {
    isRemoteControlVisible = false;
    document.getElementById('remote-control-panel').classList.remove('show');
}

// 水平移动焦点
function moveFocusHorizontal(direction) {
    currentFocusIndex += direction;
    if (currentFocusIndex < 0) {
        currentFocusIndex = controlItems.length - 1;
    } else if (currentFocusIndex >= controlItems.length) {
        currentFocusIndex = 0;
    }
    updateFocus();
}

// 垂直移动焦点
function moveFocusVertical(direction) {
    const itemsPerRow = getItemsPerRow();
    const currentRow = Math.floor(currentFocusIndex / itemsPerRow);
    const currentCol = currentFocusIndex % itemsPerRow;
    
    let newRow = currentRow + direction;
    const totalRows = Math.ceil(controlItems.length / itemsPerRow);
    
    if (newRow < 0) {
        newRow = totalRows - 1;
    } else if (newRow >= totalRows) {
        newRow = 0;
    }
    
    let newIndex = newRow * itemsPerRow + currentCol;
    if (newIndex >= controlItems.length) {
        newIndex = controlItems.length - 1;
    }
    
    currentFocusIndex = newIndex;
    updateFocus();
}

// 获取每行控制项数量
function getItemsPerRow() {
    const screenWidth = window.innerWidth;
    if (screenWidth > 1200) return 5;
    if (screenWidth > 800) return 4;
    if (screenWidth > 600) return 3;
    return 2;
}

// 更新焦点显示
function updateFocus() {
    controlItems.forEach((item, index) => {
        if (index === currentFocusIndex) {
            item.classList.add('focused');
        } else {
            item.classList.remove('focused');
        }
    });
}

// 执行当前选中的操作
function executeCurrentAction() {
    const currentItem = controlItems[currentFocusIndex];
    const action = currentItem.getAttribute('data-action');
    
    switch(action) {
        case 'play-pause':
            togglePlayPause();
            break;
        case 're-sing':
            reSing();
            break;
        case 'next-song':
            send_message(3, 0);
            break;
        case 'vocal-switch':
            toggleVocalSwitch();
            break;
        case 'volume-vocal':
            adjustVolume('vocals', 0.1);
            break;
        case 'volume-acc':
            adjustVolume('accompaniment', 0.1);
            break;
        case 'effect-applause':
            userInterruption('guzhang');
            break;
        case 'effect-cheer':
            userInterruption('huanhu');
            break;
        case 'effect-laugh':
            userInterruption('daxiao');
            break;
        case 'effect-sigh':
            userInterruption('xixu');
            break;
    }
}

// 切换播放/暂停
function togglePlayPause() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

// 切换原唱/伴奏
function toggleVocalSwitch() {
    const switch_button = document.getElementById("switchVocal");
    if (switch_button.getElementsByTagName('span')[0].innerText === "原唱") {
        send_message(4, 1);
    } else {
        send_message(4, 0);
    }
}

// 调整音量
function adjustVolume(type, step) {
    if (type === 'vocals') {
        vocalsVolume = Math.max(0, Math.min(1, vocalsVolume + step));
        vocals.volume = vocalsVolume;
        localStorage.setItem('vocalsVolume', vocalsVolume.toString());
        send_message(5, vocalsVolume);
    } else {
        accompanimentVolume = Math.max(0, Math.min(1, accompanimentVolume + step));
        accompaniment.volume = accompanimentVolume;
        localStorage.setItem('accompanimentVolume', accompanimentVolume.toString());
        send_message(6, accompanimentVolume);
    }
    updateVolumeIndicators();
}

// 更新音量指示器
function updateVolumeIndicators() {
    const vocalIndicator = document.getElementById('vocal-volume-indicator');
    const accIndicator = document.getElementById('acc-volume-indicator');
    
    if (vocalIndicator) {
        vocalIndicator.textContent = Math.round(vocalsVolume * 100) + '%';
    }
    if (accIndicator) {
        accIndicator.textContent = Math.round(accompanimentVolume * 100) + '%';
    }
}

// 更新播放/暂停按钮文本
function updatePlayPauseText() {
    const playPauseText = document.getElementById('play-pause-text');
    if (playPauseText) {
        playPauseText.textContent = video.paused ? '播放' : '暂停';
    }
}

// 生成二维码
function generateQRCode() {
    const qrCodeElement = document.getElementById('qr-code-display');
    if (qrCodeElement && typeof QRCode !== 'undefined') {
        const currentUrl = window.location.origin + "/song";
        
        new QRCode(qrCodeElement, {
            text: currentUrl,
            width: 120,
            height: 120,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

// 监听视频播放状态变化
video.addEventListener('play', function() {
    updatePlayPauseText();
});

video.addEventListener('pause', function() {
    updatePlayPauseText();
});
