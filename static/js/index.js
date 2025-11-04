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

function get_song_list(page=1) {
    currentPage = page; // 更新当前页面
    let q = document.getElementById("file-search").value;
    let params = "page=" + page;
    if (q && q !== "" && q !== null) {
        params = params + "&q=" + q;
    }
    $.ajax({
        type: "GET",
        url: server + "/song/list?" + params,
        success: function (data) {
            let s = '';
            if (data.code === 0) {
                if (data.total === 0) {
                    $.Toast("没有歌曲", "error");
                    return;
                }
                data.data.forEach(item => {
                    s = s + `<tr><td><input type="checkbox" class="song-checkbox" value="${item.id}"></td>
                            <td>${item.name}</td>
                            <td><a onclick="sing_song(${item.id})">点歌</a><a onclick="rename_song(${item.id}, '${item.name}')">重命名</a><a onclick="delete_song(${item.id}, '${item.name}')">删除</a></td></tr>`;
                })
                PagingManage($('#paging'), data.totalPage, data.page);
                document.getElementsByTagName("table")[0].style.display = "";
                // document.getElementById("create-time").style.display = "";
                document.getElementsByTagName("tbody")[0].innerHTML = s;
                document.getElementById("batch-delete").style.display = "inline-block";

                document.getElementById('select-all').onchange = function() {
                    let checkboxes = document.getElementsByClassName('song-checkbox');
                    for(let i=0; i<checkboxes.length; i++) {
                        checkboxes[i].checked = this.checked;
                    }
                };

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
                            delete_song(selected_ids.join(','), null, true); // 批量删除，直接执行
                            // 清除全选框的选中状态
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
                if (data.total === 0) {
                    $.Toast("没有歌曲", "error");
                    return;
                }
                data.data.forEach(item => {
                    s = s + `<tr><td>${item.name}</td><td><a onclick="sing_song(${item.id})">点歌</a></td></tr>`;
                })
                PagingManage($('#paging'), data.totalPage, data.page);
                document.getElementsByTagName("table")[0].style.display = "";
                // document.getElementById("create-time").style.display = "none";
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
