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
let currentTab = 'usually'; // 'usually' or 'all'
let currentInitial = ''; // 记录标签页当前的拼音筛选

// 加载曲库列表
function loadSongList(page = 1, keyword = '', append = false) {
    if (isLoading) return;
    isLoading = true;
    
    let tagId = document.getElementById("tag-filter-client") ? document.getElementById("tag-filter-client").value : "";
    
    // 如果有搜索或标签筛选，显示搜索结果区域，隐藏 Tab 和常唱/全部
    if (keyword || tagId) {
        document.getElementById("usually-section").style.display = "none";
        document.getElementById("all-songs-section").style.display = "none";
        document.querySelector(".tabs-container").style.display = "none";
        document.getElementById("search-results-section").style.display = "block";
        
        let url = server + "/song/list?page=" + page;
        if (keyword) url += "&q=" + encodeURIComponent(keyword);
        if (tagId) url += "&tag_id=" + tagId;
        
        $.ajax({
            type: "GET",
            url: url,
            success: function (data) {
                isLoading = false;
                if (data.code === 0) {
                    let s = renderSongList(data.data, append ? ((page - 1) * 20 + 1) : 1);
                    if (append) {
                        document.getElementsByClassName("search-container-results")[0].innerHTML += s;
                    } else {
                        document.getElementsByClassName("search-container-results")[0].innerHTML = s;
                    }
                    hasMoreSongs = page < data.totalPage;
                    currentPage = page;
                }
            },
            error: () => { isLoading = false; }
        });
        return;
    }
    
    // 无搜索状态，显示 Tab 切换
    document.querySelector(".tabs-container").style.display = "flex";
    document.getElementById("search-results-section").style.display = "none";
    
    if (currentTab === 'usually') {
        document.getElementById("usually-section").style.display = "block";
        document.getElementById("all-songs-section").style.display = "none";
        loadUsuallyList();
        isLoading = false;
        hasMoreSongs = false; // 常唱暂不支持分页
    } else {
        document.getElementById("usually-section").style.display = "none";
        document.getElementById("all-songs-section").style.display = "block";
        
        $.ajax({
            type: "GET",
            url: server + "/song/list?page=" + page,
            success: function (data) {
                isLoading = false;
                if (data.code === 0) {
                    let s = renderSongList(data.data, append ? ((page - 1) * 20 + 1) : 1);
                    if (append) {
                        document.getElementsByClassName("song-container")[0].innerHTML += s;
                    } else {
                        document.getElementsByClassName("song-container")[0].innerHTML = s;
                    }
                    hasMoreSongs = page < data.totalPage;
                    currentPage = page;
                }
            },
            error: () => { isLoading = false; }
        });
    }
}

// 统一渲染歌曲列表 HTML
function renderSongList(songs, startIndex) {
    let s = "";
    songs.forEach((item, index) => {
        let tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
            item.tags.forEach(tag => {
                tagsHtml += `<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: ${tag.color}; color: white; font-size: 10px; margin-left: 5px;">${tag.name}</span>`;
            });
        }
        s += `<div class="song-list"><div>${startIndex + index}. ${item.name}${tagsHtml}</div><a class="song-list-btn" onclick="sing_song(${item.id})">点歌</a></div>`;
    });
    return s;
}

// 切换 Tab
function switchTab(tab) {
    currentTab = tab;
    // 更新 UI
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        if (item.innerText === (tab === 'usually' ? '我的常唱' : '全部歌曲')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    currentPage = 1;
    hasMoreSongs = true;
    loadSongList(1);
}

// 加载“我的常唱”列表
function loadUsuallyList() {
    $.ajax({
        type: "GET",
        url: server + "/song/singHistory/usually",
        success: function (data) {
            if (data.code === 0) {
                document.getElementsByClassName("usually-container")[0].innerHTML = renderSongList(data.data, 1);
            }
        }
    });
}

// 切换标签筛选显示
function toggleTagFilter() {
    let searchInput = document.getElementById("search-text");
    let filterContainer = document.getElementById("tag-filter-client").parentElement;
    
    if (filterContainer.style.display === 'none' || filterContainer.style.display === '') {
        filterContainer.style.display = 'block';
        // 如果开启筛选，则清空关键词搜索
        if (searchInput.value) {
            searchInput.value = '';
            loadSongList(1);
        }
    } else {
        filterContainer.style.display = 'none';
        // 如果关闭筛选，则重置筛选并显示常唱
        document.getElementById("tag-filter-client").value = "";
        loadSongList(1);
    }
}

// 搜索功能
document.getElementById("search-text").addEventListener('input', () =>{
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        let keyWord = document.getElementById("search-text").value;
        let tagId = document.getElementById("tag-filter-client") ? document.getElementById("tag-filter-client").value : "";
        
        if ((keyWord === undefined || keyWord === '') && !tagId) {
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
        hasMoreSongs = true;
        loadSongList(1, keyWord);
    }, 500);
});

// 滚动加载更多
function setupScrollLoading() {
    const scrollContainer = document.getElementById("song-selection");
    if (!scrollContainer) return;
    
    // 防止重复绑定事件
    if (scrollContainer.dataset.scrollAttached) return;
    scrollContainer.dataset.scrollAttached = "true";
    
    scrollContainer.addEventListener('scroll', () => {
        if (isLoading || !hasMoreSongs) return;
        
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;
        
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
    initVolume("progress-play");
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
    } else if (eleId === "volume-acc-progress") {
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = accompanimentVolume * 100 + '%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = accompanimentVolume * 100 + '%';
    } else if (eleId === "progress-play") {
        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = '0%';
        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = '0%';
    }
    if (progressEle.getAttribute("data-bind") === "true") {return;}
    progressEle.setAttribute("data-bind", "true");
    
    progressEle.getElementsByClassName("mkpgb-dot")[0].addEventListener("mousedown", (e) => {
        e.preventDefault();
    })
    progressEle.addEventListener("mousedown", (e) => {
        mdown = true;
        progressEle.dataset.dragging = "true";
        barMove(e);
    })
    progressEle.addEventListener("mousemove", (e) => {
        barMove(e);
    })
    progressEle.addEventListener("mouseup", (e) => {
        if (eleId === "volume-vocals-progress") {
            send_message(5, vocalsVolume);
        } else if (eleId === "volume-acc-progress") {
            send_message(6, accompanimentVolume);
        } else if (eleId === "progress-play") {
            let percent = 0;
            let startIndex = progressEle.getBoundingClientRect().left;
            if(e.clientX < startIndex){
                percent = 0;
            }else if(e.clientX > progressEle.clientWidth + startIndex){
                percent = 1;
            }else{
                percent = (e.clientX - startIndex) / progressEle.clientWidth;
            }
            send_message(9, percent);
        }
        mdown = false;
        progressEle.dataset.dragging = "false";
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
        } else if (eleId === "volume-acc-progress") {
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

function load_tags_for_filter_client() {
    let select = document.getElementById('tag-filter-client');
    if (!select) return;
    
    let currentTagId = select.value;
    
    $.ajax({
        type: "GET",
        url: server + "/song/tags?page=0",
        success: function (data) {
            if (data.code === 0) {
                let html = '<option value="">筛选标签</option>';
                // 按照标签名称进行排序，优化中文排序
                data.data.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
                data.data.forEach(tag => {
                    html += `<option value="${tag.id}" ${tag.id == currentTagId ? 'selected' : ''}>${tag.name}</option>`;
                });
                select.innerHTML = html;
            }
        }
    });
}

window.onload = () => {
    load_tags_for_filter_client();
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
                break;
            case 10:
                // 实时更新播放进度
                const progressEle = document.getElementById("progress-play");
                if (progressEle && progressEle.dataset.dragging !== "true") {
                    const percent = parseFloat(message.data);
                    if (!isNaN(percent)) {
                        progressEle.getElementsByClassName("mkpgb-cur")[0].style.width = percent * 100 + '%';
                        progressEle.getElementsByClassName("mkpgb-dot")[0].style.left = percent * 100 + '%';
                    }
                }
                break;
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
        load_tags_for_filter_client(); // 每次切换回点歌页面时刷新标签列表
        
        // 每次切换回点歌页面都重新加载（以显示最新的常唱歌曲或搜索结果）
        currentPage = 1;
        hasMoreSongs = true;
        let keyWord = document.getElementById("search-text").value;
        loadSongList(1, keyWord);
        setupScrollLoading();
    } else if (sectionId === 'tag-list') {
        searchSection.style.display = 'none';
        loadFullTagList(currentInitial);
        // 延迟一丁点确保 DOM 已完全可见并能正确应用样式
        setTimeout(() => {
            const items = document.querySelectorAll('#tag-list .initial-item');
            items.forEach(item => {
                if (item.getAttribute('onclick').includes(`'${currentInitial}'`)) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }, 50);
    } else if (sectionId === 'tag-songs') {
        searchSection.style.display = 'none';
    } else {
        searchSection.style.display = 'none';
    }
}

// 加载完整的标签列表页面
function loadFullTagList(initial = '') {
    let url = server + "/song/tags?page=0";
    if (initial) {
        url += "&initial=" + initial;
    }
    $.ajax({
        type: "GET",
        url: url,
        success: function (data) {
            if (data.code === 0) {
                let s = "";
                // 排序已经在后端或此处通过 localeCompare 确保
                data.data.forEach(tag => {
                    s += `
                        <div class="tag-item-row" onclick="showTagSongs(${tag.id}, '${tag.name.replace(/'/g, "\\'")}')">
                            <div class="tag-item-left">
                                <div class="tag-item-avatar" style="background: ${tag.color}">${tag.name[0]}</div>
                                <div class="tag-item-name">${tag.name}</div>
                            </div>
                            <div class="tag-item-arrow">
                                <svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M338.752 104.704a32 32 0 0 0 0 45.248L646.656 457.856 338.752 765.76a32 32 0 1 0 45.248 45.248l330.368-330.368a32 32 0 0 0 0-45.248L384 104.704a32 32 0 0 0-45.248 0z"></path></svg>
                            </div>
                        </div>
                    `;
                });
                document.getElementsByClassName("tag-items-container")[0].innerHTML = s;
            }
        }
    });
}

// 字母筛选
function filterByInitial(initial) {
    currentInitial = initial;
    // 更新 UI 状态
    const items = document.querySelectorAll('#tag-list .initial-item');
    items.forEach(item => {
        if (item.getAttribute('onclick').includes(`'${initial}'`)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    loadFullTagList(initial);
}

// 展示特定标签下的歌曲
function showTagSongs(tagId, tagName) {
    document.getElementById("current-tag-name").innerText = tagName;
    showSection('tag-songs');
    
    $.ajax({
        type: "GET",
        url: server + "/song/list?page=1&tag_id=" + tagId,
        success: function (data) {
            if (data.code === 0) {
                let s = "";
                // 按歌曲名称排序
                data.data.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
                data.data.forEach((item, index) => {
                    s += `<div class="song-list"><div>${index + 1}. ${item.name}</div><a class="song-list-btn" onclick="sing_song(${item.id})">点歌</a></div>`;
                });
                document.getElementsByClassName("tag-songs-container")[0].innerHTML = s;
            }
        }
    });
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