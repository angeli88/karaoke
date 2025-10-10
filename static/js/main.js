const server = localStorage.getItem("server");
let angle = 0;
let vocalsVolume = localStorage.getItem("vocalsVolume")? parseFloat(localStorage.getItem("vocalsVolume")): 1;
let accompanimentVolume = localStorage.getItem("accompanimentVolume")? parseFloat(localStorage.getItem("accompanimentVolume")): 1;
let isBindEvent = false;
let searchTimeout = null;
const l_body = document.querySelector('.l_body');
const sidebar = {
  leftbar: () => {
    if (l_body) {
      l_body.toggleAttribute('leftbar');
      l_body.removeAttribute('rightbar');
    }
  },
  rightbar: () => {
    if (l_body) {
      l_body.toggleAttribute('rightbar');
      l_body.removeAttribute('leftbar');
    }
  },
  dismiss: () => {
    if (l_body) {
      l_body.removeAttribute('leftbar');
      l_body.removeAttribute('rightbar');
    }
  }
}

document.getElementById("rotate-img").addEventListener('click', () => {
    if(document.getElementById("main-image").classList.contains('rotating')) {
        send_message(1, 0);
    } else {
        if (document.getElementsByClassName("current-song")[0].innerText === "暂未开始播放") {
            send_message(1, 5);
        } else {
            send_message(1, 1);
        }
    }
})

document.getElementById("re-sing").addEventListener('click', () => {send_message(2, 0);})
document.getElementById("next-song").addEventListener('click', () => {send_message(3, 0);})
document.getElementById("switchVocal").addEventListener('click', () => {
    let switch_button = document.getElementById("switchVocal");
    if (switch_button.getElementsByTagName('p')[0].innerText === "原唱") {
        send_message(4, 1);
    } else {
        send_message(4, 0);
    }
})

// 曲库相关变量
let currentPage = 1;
let isLoading = false;
let hasMoreSongs = true;
let isSearchMode = false;

// 加载曲库列表
function loadSongList(page = 1, keyword = '', append = false) {
    if (isLoading) return;
    isLoading = true;
    
    let url = server + "/song/list?page=" + page;
    if (keyword) {
        url += "&q=" + encodeURIComponent(keyword);
    }
    
    $.ajax({
        type: "GET",
        url: url,
        success: function (data) {
            isLoading = false;
            if (data.code === 0) {
                let s = "";
                data.data.forEach((item, index) => {
                    let displayIndex = append ? ((page - 1) * 20 + index + 1) : (index + 1);
                    s += `<div class="song-list"><div>${displayIndex}. ${item.name}</div><a style="font-size: 75%;" onclick="sing_song(${item.id})">点歌</a></div>`;
                });
                
                if (append) {
                    document.getElementsByClassName("song-container")[0].innerHTML += s;
                } else {
                    document.getElementsByClassName("song-container")[0].innerHTML = s;
                }
                
                // 更新分页状态
                hasMoreSongs = page < data.totalPage;
                console.log(hasMoreSongs);
                currentPage = page;
            } else {
                console.log(data.msg);
            }
        },
        error: function() {
            isLoading = false;
            console.log("加载歌曲列表失败");
        }
    });
}

// 搜索功能
document.getElementById("search-text").addEventListener('input', () =>{
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        let keyWord = document.getElementById("search-text").value;
        if (keyWord === undefined || keyWord === '') {
            // 清空搜索，显示完整曲库
            isSearchMode = false;
            currentPage = 1;
            hasMoreSongs = true;
            loadSongList(1);
            return;
        }
        // 搜索模式
        isSearchMode = true;
        currentPage = 1;
        hasMoreSongs = true; // 搜索结果不支持翻页
        loadSongList(1, keyWord);
    }, 500);
});

// 滚动加载更多
function setupScrollLoading() {
    const songContainer = document.getElementsByClassName("song-container")[0];
    if (!songContainer) return;
    
    songContainer.addEventListener('scroll', () => {
        if (isLoading || !hasMoreSongs) return; // 移除了 isSearchMode 条件
        
        const scrollTop = songContainer.scrollTop;
        const scrollHeight = songContainer.scrollHeight;
        const clientHeight = songContainer.clientHeight;
        
        // 当滚动到底部附近时加载更多
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            // 根据是否为搜索模式传递不同参数
            if (isSearchMode) {
                let keyWord = document.getElementById("search-text").value;
                loadSongList(currentPage + 1, keyWord, true);
            } else {
                loadSongList(currentPage + 1, '', true);
            }
        }
    });
}
document.getElementById("change-volume").addEventListener("click", () => {
    let volume_setting = document.getElementsByClassName("volume-setting")[0];
    if (volume_setting.style.display === 'flex') {
        volume_setting.style.display = 'none';
        return;
    }
    volume_setting.style.display = 'flex';
    initVolume("volume-vocals-progress");
    initVolume("volume-acc-progress");
})

startRotate = () => {
    if(!document.getElementById("main-image").classList.contains('rotating')) {
        document.getElementById("main-image").classList.add('rotating');
    }
    document.getElementById("rotate-img").getElementsByTagName("img")[0].src = "/static/img/stopRotate.svg";
    document.getElementById("rotate-img").getElementsByTagName("p")[0].innerText = "暂停";
    document.getElementById("main-image").style.transform = `rotate(${angle}deg)`;
}

stopRotate = () => {
    document.getElementById("rotate-img").getElementsByTagName("img")[0].src = "/static/img/startRotate.svg";
    document.getElementById("rotate-img").getElementsByTagName("p")[0].innerText = "开始";
    const image = document.getElementById("main-image");
    const computedStyle = getComputedStyle(image);
    const matrix = new WebKitCSSMatrix(computedStyle.transform);
    angle = Math.round(Math.atan2(matrix.m21, matrix.m11) * (180 / Math.PI));
    image.classList.remove('rotating');
    image.style.transform = `rotate(${angle}deg)`;
}

send_message = (code, data) => {
    $.ajax({
        type: "GET",
        url: server + "/song/send/event?code=" + code + "&data=" + data,
        success: function (data) {
            if (data.code !== 0) {
                console.log(data.msg);
            }
        }
    })
}

getSingList = () => {
    $.ajax({
        type: "GET",
        url: server + "/song/singHistory/pendingAll",
        success: function (data) {
            if (data.code === 0) {
                if (data.total > 0) {
                    if (data.data[0].is_sing === -1) {
                        document.getElementsByClassName("current-song")[0].innerText = data.data[0].name;
                        startRotate();
                        if (data.data.length > 1) {
                            document.getElementsByClassName("next-song")[0].innerText = "下一首：" + data.data[1].name;
                        } else {
                            document.getElementsByClassName("next-song")[0].innerText = "暂无下一首歌曲";
                        }
                    } else {
                        document.getElementsByClassName("current-song")[0].innerText = "暂未开始播放";
                        document.getElementsByClassName("next-song")[0].innerText = "下一首：" + data.data[0].name;
                        stopRotate();
                    }
                } else {
                    document.getElementsByClassName("current-song")[0].innerText = "暂未开始播放";
                    document.getElementsByClassName("next-song")[0].innerText = "暂无下一首歌曲";
                    stopRotate();
                }
                let s = "";
                data.data.forEach((item, index) => {
                    s = s + `<div class="song-list"><div>${index + 1}. ${item.name}</div><a onclick="set_top(${item.id})">置顶</a><a onclick="delete_from_list(${item.id})">删除</a></div>`
                })
                document.getElementsByClassName("added-container")[0].innerHTML = s;
                updateSongCount(data.total);
            } else {
                console.log(data.msg);
            }
        }
    })
}

switchVocal = (flag) => {
    let switch_button = document.getElementById("switchVocal");
    if (flag === 'ON') {
        switch_button.getElementsByTagName('p')[0].innerText = "原唱"
        switch_button.style.filter = "grayscale(0)";
    } else {
        switch_button.getElementsByTagName('p')[0].innerText = "伴奏"
        switch_button.style.filter = "grayscale(1)";
    }
}

initVolume = (eleId) => {
    let mdown = false;
    let progressEle = document.getElementById(eleId);
    let startIndex = progressEle.getBoundingClientRect().left;
    if (eleId === "volume-vocals-progress") {
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = vocalsVolume * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = vocalsVolume * 100 + '%';
    } else {
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
        } else {
            accompanimentVolume = percent;
        }
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = percent * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = percent * 100 + '%';
        return true;
    }
}

function sing_song(file_id) {
    $.ajax({
        type: "GET",
        url: server + "/song/sing/" + file_id,
        success: function (data) {
            if (data.code !== 0) {
                console.log(data.msg);
            }
        }
    })
}

function set_top(file_id) {
    $.ajax({
        type: "GET",
        url: server + "/song/setTop/" + file_id,
        success: function (data) {
            if (data.code !== 0) {
                console.log(data.msg);
            }
        }
    })
}

function delete_from_list(file_id) {
    $.ajax({
        type: "GET",
        url: server + "/song/deleteHistory/" + file_id,
        success: function (data) {
            if (data.code !== 0) {
                console.log(data.msg);
            }
        }
    })
}

window.onload = function() {
    const eventSource = new EventSource(server + "/song/events");
    eventSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        switch (message.code) {
            case 1:
                if (message.data === '4') {stopRotate();}
                if (message.data === '3') {startRotate(); getSingList();}
                break;
            case 4:
                if (message.data === '0') {switchVocal("ON");}
                if (message.data === '1') {switchVocal("OFF");}
                break;
            case 5:
                vocalsVolume = parseFloat(message.data);
                localStorage.setItem('vocalsVolume', message.data);
                break;
            case 6:
                accompanimentVolume = parseFloat(message.data);
                localStorage.setItem('accompanimentVolume', message.data);
                break;
            case 8:
                getSingList();
        }
    };
    eventSource.onerror = function(event) {
        console.error("EventSource failed:", event);
        eventSource.close();
    };
    getSingList();
    
    // 设置滚动加载功能
    setupScrollLoading();
};

// 新的导航功能
function showSection(sectionId) {
    // 隐藏所有内容区域
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // 显示选中的区域
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // 更新导航按钮状态
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 设置当前按钮为活跃状态
    const activeButton = document.querySelector(`[onclick="showSection('${sectionId}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // 如果是点歌区域，显示搜索框并初始化曲库
    const searchSection = document.getElementById('search-section');
    if (sectionId === 'song-selection') {
        searchSection.style.display = 'block';
        // 初始化曲库列表（如果还没有加载过）
        const songContainer = document.getElementsByClassName("song-container")[0];
        if (songContainer && songContainer.innerHTML.trim() === '') {
            currentPage = 1;
            hasMoreSongs = true;
            isSearchMode = false;
            loadSongList(1);
            setupScrollLoading();
        }
    } else {
        searchSection.style.display = 'none';
    }
}

// 更新歌曲数量显示
function updateSongCount(count) {
    const badge = document.getElementById('added-song-num');
    const countSpan = document.getElementById('added-song-num1');
    
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
    
    if (countSpan) {
        countSpan.textContent = count;
    }
}