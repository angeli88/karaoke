const server = localStorage.getItem("server");
let songListTimeout = null;
let currentPage = 1; // 记录当前页面
document.getElementById("file-upload").addEventListener('click', () => {
    let fileUpload_input = document.getElementById("file-input");
    fileUpload_input.click();
    fileUpload_input.onchange = function (event) {
        show_modal_cover();
        let files = event.target.files;
        let total_files = files.length;
        if (total_files < 1) {
            close_modal_cover();
            return;
        }
        let success_num = 0;
        let fast_upload_num = 0;
        let failure_num = 0;
        let failure_file = [];

        for (let i=0; i<total_files; i++) {
            let form_data = new FormData();
            form_data.append("file", files[i]);
            form_data.append("index", (i + 1).toString());
            form_data.append("total", total_files.toString());

            let xhr = new XMLHttpRequest();
            xhr.open("POST", server + "/song/upload");
            xhr.setRequestHeader("processData", "false");
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if(xhr.status === 200) {
                        let res = JSON.parse(xhr.responseText);
                        if (res['code'] === 0) {
                            success_num += 1;
                        } else {
                            failure_num += 1;
                            failure_file.push(res['data']);
                        }
                    }
                    if ((success_num + fast_upload_num + failure_num) === total_files) {
                        let msg = "";
                        let level = "success";
                        if (success_num > 0) {
                            msg += success_num + "个文件上传成功";
                        }
                        if (failure_num > 0) {
                            if (msg.length > 0) {msg += '，';}
                            msg += failure_num + "个文件上传失败";
                            level = "error";
                        }
                        $.Toast(msg, level);
                        if (failure_num > 0) {
                            let s = "";
                            for (let i=0; i<failure_file.length; i++) {
                                s += failure_file[i] + "，";
                            }
                            $.Toast(s, 'error');
                        }
                    }
                }
                fileUpload_input.value = '';
                close_modal_cover();
                get_song_list();
            }
            xhr.send(form_data);
        }
    }
})

document.getElementById("file-search").addEventListener('input', () => {
    clearTimeout(songListTimeout);
    songListTimeout = setTimeout(() => {get_song_list();}, 500)
})

document.getElementById("generate_code").addEventListener('click', () => {
    let qrcodeEle = document.getElementsByClassName("qrcode")[0];
    if (qrcodeEle.style.display !== "block") {
        let qrcode = new QRCode(document.getElementById("qrcode"), {
            text: window.location.protocol + "//" + window.location.host + server + "/song",
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        qrcodeEle.style.display = "block";
    } else {
        qrcodeEle.style.display = "none";
        document.getElementById("qrcode").innerHTML = '';
    }
})

document.getElementById("auto-tag").addEventListener('click', () => {
    if (confirm("确定要根据曲库所有歌曲名称自动添加标签吗？这可能需要一些时间。")) {
        show_modal_cover();
        $.ajax({
            type: "POST",
            url: server + "/song/tags/auto",
            success: function (data) {
                close_modal_cover();
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    get_song_list(currentPage);
                } else {
                    $.Toast(data.msg, "error");
                }
            },
            error: function () {
                close_modal_cover();
                $.Toast("请求失败", "error");
            }
        });
    }
})

document.getElementById("manage-all-tags").addEventListener('click', () => {
    get_all_tags_list(1);
})

function get_all_tags_list(page = 1) {
    currentPage = page;
    $.ajax({
        type: "GET",
        url: server + "/song/tags?page=" + page,
        success: function (data) {
            let s = '';
            if (data.code === 0) {
                if (data.total === 0) {
                    $.Toast("没有标签", "error");
                    document.getElementsByTagName("tbody")[0].innerHTML = '';
                    return;
                }
                
                // 修改表头以适应标签管理
                let thead = document.querySelector("thead tr");
                thead.innerHTML = `
                    <th>标签名称</th>
                    <th>颜色</th>
                    <th>创建时间</th>
                    <th>操作</th>
                `;

                data.data.forEach(item => {
                    s = s + `<tr>
                            <td><span class="song-tag" style="background-color: ${item.color};">${item.name}</span></td>
                            <td>${item.color}</td>
                            <td>${item.create_time}</td>
                            <td>
                                <a onclick="edit_tag(${item.id}, '${item.name}', '${item.color}')" title="编辑">编辑</a>
                                <a onclick="delete_tag_confirm(${item.id}, '${item.name}')" title="删除">删除</a>
                            </td></tr>`;
                })
                
                PagingManage($('#paging'), data.totalPage, data.page, 'get_all_tags_list');
                document.getElementsByTagName("table")[0].style.display = "";
                document.getElementsByTagName("tbody")[0].innerHTML = s;
                document.getElementById("batch-delete").style.display = "none";
                
                // 添加“创建新标签”行到 tbody 底部或作为单独区域
                let createRow = `
                    <tr class="create-tag-row">
                        <td colspan="2"><input type="text" id="new-tag-name-global" placeholder="新标签名称" style="width: 80%;"></td>
                        <td><input type="color" id="new-tag-color-global" value="#007bff" style="width: 50px; height: 30px;"></td>
                        <td><button onclick="create_new_tag_global()" class="tag-dialog-btn tag-dialog-btn-primary">创建</button></td>
                    </tr>
                `;
                document.getElementsByTagName("tbody")[0].insertAdjacentHTML('afterbegin', createRow);
            } else {
                $.Toast(data.msg, 'error');
            }
        }
    })
}

function delete_tag_confirm(tag_id, tag_name) {
    if (confirm(`确定要删除标签 "${tag_name}" 吗？此操作将同时从所有歌曲中移除该标签。`)) {
        $.ajax({
            type: "DELETE",
            url: server + "/song/tags/" + tag_id,
            success: function (data) {
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    get_all_tags_list(currentPage);
                } else {
                    $.Toast(data.msg, "error");
                }
            }
        });
    }
}

function edit_tag(tag_id, tag_name, tag_color) {
    show_edit_tag_modal(tag_id, tag_name, tag_color);
}

function show_edit_tag_modal(tag_id, tag_name, tag_color) {
    let dialogHtml = `
        <div id="edit-tag-dialog" class="tag-dialog-overlay">
            <div class="tag-dialog-content">
                <h3>编辑标签</h3>
                <div class="tag-section">
                    <div class="tag-dialog-input-group">
                        <input type="text" id="edit-tag-name" value="${tag_name}" placeholder="标签名称" class="tag-dialog-input">
                        <input type="color" id="edit-tag-color" value="${tag_color}" class="tag-color-input">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button onclick="update_tag_submit(${tag_id})" class="tag-dialog-btn tag-dialog-btn-primary">保存</button>
                    <button onclick="close_edit_tag_dialog()" class="tag-dialog-btn tag-dialog-btn-secondary">取消</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
}

function close_edit_tag_dialog() {
    let dialog = document.getElementById('edit-tag-dialog');
    if (dialog) dialog.remove();
}

function update_tag_submit(tag_id) {
    let name = document.getElementById('edit-tag-name').value.trim();
    let color = document.getElementById('edit-tag-color').value;
    
    if (!name) {
        $.Toast("请输入标签名称", "warning");
        return;
    }
    
    $.ajax({
        type: "PUT",
        url: server + "/song/tags/" + tag_id + "?name=" + encodeURIComponent(name) + "&color=" + encodeURIComponent(color),
        success: function (data) {
            if (data.code === 0) {
                $.Toast(data.msg, "success");
                close_edit_tag_dialog();
                get_all_tags_list(currentPage);
            } else {
                $.Toast(data.msg, "error");
            }
        }
    });
}

function create_new_tag_global() {
    let tag_name = document.getElementById('new-tag-name-global').value.trim();
    let tag_color = document.getElementById('new-tag-color-global').value;
    
    if (!tag_name) {
        $.Toast("请输入标签名称", "warning");
        return;
    }
    
    $.ajax({
        type: "POST",
        url: server + "/song/tags?name=" + encodeURIComponent(tag_name) + "&color=" + encodeURIComponent(tag_color),
        success: function (data) {
            if (data.code === 0) {
                $.Toast(data.msg, "success");
                get_all_tags_list(currentPage);
            } else {
                $.Toast(data.msg, "error");
            }
        }
    });
}

function get_song_list(page=1) {
    currentPage = page; // 更新当前页面
    let q = document.getElementById("file-search").value;
    let params = "page=" + page;
    if (q && q !== "" && q !== null) {
        params = params + "&q=" + q;
    }
    $.ajax({
        type: "GET",
        url: server + "/song/listWithTags?" + params,
        success: function (data) {
            let s = '';
            if (data.code === 0) {
                // 恢复歌曲列表表头
                let thead = document.querySelector("thead tr");
                thead.innerHTML = `
                    <th><input type="checkbox" id="select-all"></th>
                    <th>名称</th>
                    <th>标签</th>
                    <th>操作</th>
                `;

                if (data.total === 0) {
                    $.Toast("没有歌曲", "error");
                    document.getElementsByTagName("tbody")[0].innerHTML = '';
                    return;
                }
                data.data.forEach(item => {
                    let tagsHtml = '';
                    if (item.tags && item.tags.length > 0) {
                        item.tags.forEach(tag => {
                            tagsHtml += `<span class="song-tag" style="background-color: ${tag.color};">${tag.name}</span>`;
                        });
                    }
                    let safeSongName = item.name.replace(/'/g, "\\'");
                    s = s + `<tr><td><input type="checkbox" class="song-checkbox" value="${item.id}"></td>
                            <td>${item.name}</td>
                            <td>${tagsHtml}</td>
                            <td><a onclick="sing_song(${item.id})" title="点歌">点歌</a><a onclick="rename_song(${item.id}, '${safeSongName}')" title="重命名">重命名</a><a onclick="manage_tags(${item.id}, '${safeSongName}')" title="标签">标签</a><a onclick="delete_song(${item.id}, '${safeSongName}')" title="删除">删除</a></td></tr>`;
                })
                PagingManage($('#paging'), data.totalPage, data.page, 'get_song_list');
                document.getElementsByTagName("table")[0].style.display = "";
                document.getElementsByTagName("tbody")[0].innerHTML = s;
                document.getElementById("batch-delete").style.display = "inline-flex";

                document.getElementById('select-all').onchange = function() {
                    let checkboxes = document.getElementsByClassName('song-checkbox');
                    for(let i=0; i<checkboxes.length; i++) {
                        checkboxes[i].checked = this.checked;
                    }
                };
                
                // 重新绑定批量删除
                document.getElementById('batch-delete').onclick = function() {
                    let checkboxes = document.getElementsByClassName('song-checkbox');
                    let selected_ids = [];
                    for(let i=0; i<checkboxes.length; i++) {
                        if(checkboxes[i].checked) {
                            selected_ids.push(checkboxes[i].value);
                        }
                    }
                    if(selected_ids.length > 0) {
                        if(confirm(`确定要删除选中的 ${selected_ids.length} 首歌曲吗？`)) {
                            delete_song(selected_ids.join(','), null, true);
                            document.getElementById('select-all').checked = false;
                        }
                    } else {
                        $.Toast("请先选择要删除的歌曲", "warning");
                    }
                }
            } else {
                $.Toast(data.msg, 'error');
            }
        }
    })
}

function get_history_list(queryType) {
    $.ajax({
        type: "GET",
        url: server + "/song/singHistory/" + queryType,
        success: function (data) {
            let s = '';
            if (data.code === 0) {
                // 恢复/设置历史列表表头
                let thead = document.querySelector("thead tr");
                thead.innerHTML = `
                    <th>名称</th>
                    <th></th>
                    <th>操作</th>
                `;

                if (data.total === 0) {
                    $.Toast("没有歌曲", "error");
                    document.getElementsByTagName("tbody")[0].innerHTML = '';
                    return;
                }
                data.data.forEach(item => {
                    s = s + `<tr><td>${item.name}</td><td></td><td><a onclick="sing_song(${item.id})">点歌</a></td></tr>`;
                })
                PagingManage($('#paging'), data.totalPage, data.page, 'get_history_list');
                document.getElementsByTagName("table")[0].style.display = "";
                document.getElementById("batch-delete").style.display = "none";
                document.getElementsByTagName("tbody")[0].innerHTML = s;
            } else {
                $.Toast(data.msg, 'error');
            }
        }
    })
}

function delete_song(file_id, file_name, batch = false) {
    const perform_delete = () => {
        $.ajax({
            type: "GET",
            url: server + "/song/delete/" + file_id,
            success: function (data) {
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    // 删除后刷新当前页面，如果当前页面没有数据了则回到上一页
                    $.ajax({
                        type: "GET",
                        url: server + "/song/list?page=" + currentPage + (document.getElementById("file-search").value ? "&q=" + document.getElementById("file-search").value : ""),
                        success: function (checkData) {
                            if (checkData.code === 0 && checkData.total === 0 && currentPage > 1) {
                                // 当前页面没有数据了，回到上一页
                                get_song_list(currentPage - 1);
                            } else {
                                // 刷新当前页面
                                get_song_list(currentPage);
                            }
                        },
                        error: function() {
                            // 出错时刷新当前页面
                            get_song_list(currentPage);
                        }
                    });
                    get_added_songs();
                } else {
                    $.Toast(data.msg, "error");
                }
            }
        })
    }

    if (batch) {
        perform_delete();
    } else {
        if (confirm(`确定要删除歌曲 ${file_name} 吗？`)) {
            perform_delete();
        }
    }
}

function sing_song(file_id) {
    $.ajax({
        type: "GET",
        url: server + "/song/sing/" + file_id,
        success: function (data) {
            if (data.code === 0) {
                get_added_songs();
                $.Toast(data.msg, "success");
            } else {
                $.Toast(data.msg, "error");
            }
        }
    })
}

function get_added_songs() {
    $.ajax({
        type: "GET",
        url: server + "/song/singHistory/pendingAll",
        success: function (data) {
            if (data.code === 0) {
                document.getElementById("addSongs").innerText = data.total;
            } else {
                $.Toast(data.msg, "error");
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

function show_modal_cover() {
    $('.modal_cover')[0].style.display = 'flex';
    $('.modal_cover>.modal_gif')[0].style.display = 'flex';
}

function close_modal_cover() {
    $('.modal_cover')[0].style.display = 'none';
    $('.modal_cover>.modal_gif')[0].style.display = 'none';
}

window.onload = function() {
    get_song_list();
    setTimeout(() => {get_added_songs();}, 500);
};


function rename_song(id, oldName) {
    let newName = prompt("请输入新的歌曲名称:", oldName);
    if (newName && newName !== oldName) {
        $.ajax({
            type: "GET",
            url: server + "/song/rename/" + id + "/" + encodeURIComponent(newName),
            success: function (data) {
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    get_song_list(currentPage);
                } else {
                    $.Toast(data.msg, "error");
                }
            }
        });
    }
}


// 标签管理相关函数
let currentSongTagPage = 1;
let currentSongTagSearch = "";

function manage_tags(song_id, song_name, page = 1, search = "") {
    currentSongTagPage = page;
    currentSongTagSearch = search;
    
    // 获取歌曲已选标签和所有标签（带分页和搜索）
    $.ajax({
        type: "GET",
        url: server + "/song/songs/" + song_id + "/tags",
        success: function (songTagsData) {
            if (songTagsData.code === 0) {
                let song_tags = songTagsData.data;
                $.ajax({
                    type: "GET",
                    url: server + "/song/tags?page=" + page + "&q=" + encodeURIComponent(search),
                    success: function (allTagsData) {
                        if (allTagsData.code === 0) {
                            // 如果是搜索或第一页，且有已选标签，我们需要确保已选标签在展示时有特殊处理
                            // 但由于 API 分页限制，我们可能无法在所有页面都展示所有已选标签
                            // 这里采用逻辑：在展示列表中，如果标签已选，则勾选；
                            // 同时在顶部单独列出该歌曲已有的所有标签（不分页），方便取消
                            show_tag_dialog(song_id, song_name, allTagsData.data, song_tags, allTagsData.totalPage, allTagsData.page);
                        } else {
                            $.Toast(allTagsData.msg, "error");
                        }
                    }
                });
            } else {
                $.Toast(songTagsData.msg, "error");
            }
        }
    });
}

function close_tag_dialog() {
    let dialog = document.getElementById('tag-dialog');
    if (dialog) dialog.remove();
}

function show_tag_dialog(song_id, song_name, display_tags, selected_tags, totalPage, currentPage) {
    // 移除旧对话框（如果存在）
    close_tag_dialog();

    let safeSongName = song_name.replace(/'/g, "\\'");

    let dialogHtml = `
        <div id="tag-dialog" class="tag-dialog-overlay">
            <div class="tag-dialog-content" style="max-width: 500px; width: 90%;">
                <h3 style="margin-bottom: 15px;">管理标签 - ${song_name}</h3>
                
                <div class="tag-section">
                    <h4>已选标签：</h4>
                    <div id="selected-tags-container" class="available-tags-container" style="min-height: 40px; margin-bottom: 15px; padding: 10px; border: 1px dashed #ccc; border-radius: 4px;">
                        ${selected_tags.length > 0 ? selected_tags.map(tag => {
                            let safeTagName = tag.name.replace(/'/g, "\\'");
                            return `<label class="tag-badge" style="background: ${tag.color}; color: white;">
                                <input type="checkbox" value="${tag.id}" checked onchange="toggle_song_tag_in_dialog(${song_id}, ${tag.id}, false, '${safeTagName}', '${safeSongName}')">
                                ${tag.name}
                            </label>`;
                        }).join('') : '<span style="color: #999; font-size: 12px;">暂无已选标签</span>'}
                    </div>
                </div>

                <div class="tag-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0;">所有标签：</h4>
                        <input type="text" id="tag-search-input" placeholder="搜索标签..." value="${currentSongTagSearch}" 
                               style="height: 25px; min-width: 150px; padding: 2px 8px; font-size: 12px;"
                               oninput="debounce_tag_search(${song_id}, '${safeSongName}', this.value)">
                    </div>
                    <div id="available-tags" class="available-tags-container" style="max-height: 200px; overflow-y: auto; padding: 5px; border: 1px solid #eee; border-radius: 4px;">
                        ${display_tags.map(tag => {
                            let is_checked = selected_tags.some(song_tag => song_tag.id === tag.id);
                            let safeTagName = tag.name.replace(/'/g, "\\'");
                            // 如果已经选了，在“所有标签”列表里可以不显示或者置灰，这里选择正常显示但同步勾选状态
                            return `<label class="tag-badge" style="background: ${tag.color}; color: white; ${is_checked ? 'opacity: 0.6;' : ''}">
                                <input type="checkbox" value="${tag.id}" ${is_checked ? 'checked' : ''} onchange="toggle_song_tag_in_dialog(${song_id}, ${tag.id}, this.checked, '${safeTagName}', '${safeSongName}')">
                                ${tag.name}
                            </label>`;
                        }).join('')}
                    </div>
                    <!-- 标签内分页 -->
                    <div id="tag-pagination" style="margin-top: 10px; display: flex; justify-content: center; gap: 10px; font-size: 12px;">
                        ${currentPage > 1 ? `<a href="#" onclick="manage_tags(${song_id}, '${safeSongName}', ${currentPage - 1}, '${currentSongTagSearch}')">上一页</a>` : ''}
                        <span>${currentPage} / ${totalPage}</span>
                        ${currentPage < totalPage ? `<a href="#" onclick="manage_tags(${song_id}, '${safeSongName}', ${currentPage + 1}, '${currentSongTagSearch}')">下一页</a>` : ''}
                    </div>
                </div>

                <div class="tag-section" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                    <h4>创建新标签：</h4>
                    <div class="tag-dialog-input-group">
                        <input type="text" id="new-tag-name" placeholder="标签名称" class="tag-dialog-input">
                        <input type="color" id="new-tag-color" value="#007bff" class="tag-color-input">
                        <button onclick="create_new_tag(${song_id}, '${safeSongName}')" class="tag-dialog-btn tag-dialog-btn-primary">创建</button>
                    </div>
                </div>
                
                <div class="dialog-footer" style="margin-top: 20px;">
                    <button onclick="close_tag_dialog()" class="tag-dialog-btn tag-dialog-btn-secondary">关闭</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
    
    // 自动聚焦搜索框（如果是输入触发的刷新）
    if (currentSongTagSearch) {
        const searchInput = document.getElementById('tag-search-input');
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
}

let tagSearchTimeout = null;
function debounce_tag_search(song_id, song_name, value) {
    clearTimeout(tagSearchTimeout);
    tagSearchTimeout = setTimeout(() => {
        manage_tags(song_id, song_name, 1, value);
    }, 500);
}

function toggle_song_tag_in_dialog(song_id, tag_id, add, tag_name, song_name) {
    if (add) {
        $.ajax({
            type: "POST",
            url: server + "/song/songs/" + song_id + "/tags/" + tag_id,
            success: function (data) {
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    // 局部刷新对话框
                    manage_tags(song_id, song_name, currentSongTagPage, currentSongTagSearch);
                    get_song_list(currentPage); // 同时刷新背景列表
                } else {
                    $.Toast(data.msg, "error");
                }
            }
        });
    } else {
        $.ajax({
            type: "DELETE",
            url: server + "/song/songs/" + song_id + "/tags/" + tag_id,
            success: function (data) {
                if (data.code === 0) {
                    $.Toast(data.msg, "success");
                    // 局部刷新对话框
                    manage_tags(song_id, song_name, currentSongTagPage, currentSongTagSearch);
                    get_song_list(currentPage); // 同时刷新背景列表
                } else {
                    $.Toast(data.msg, "error");
                }
            }
        });
    }
}


function create_new_tag(song_id, song_name) {
    let tag_name = document.getElementById('new-tag-name').value.trim();
    let tag_color = document.getElementById('new-tag-color').value;
    
    if (!tag_name) {
        $.Toast("请输入标签名称", "warning");
        return;
    }
    
    $.ajax({
        type: "POST",
        url: server + "/song/tags?name=" + encodeURIComponent(tag_name) + "&color=" + encodeURIComponent(tag_color),
        success: function (data) {
            if (data.code === 0) {
                $.Toast(data.msg, "success");
                close_tag_dialog();
                get_song_list(currentPage); // 重新获取歌曲列表
                manage_tags(song_id, song_name); // 重新打开标签管理对话框
            } else {
                $.Toast(data.msg, "error");
            }
        }
    });
}
