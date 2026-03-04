#!/usr/bin/env python
# -*- coding: utf-8 -*-
# @Author: leeyoshinari

import json
import os.path
import shutil
import asyncio
import uuid
import subprocess
import traceback
import csv
import collections
from typing import List, Dict, Optional
from urllib.parse import unquote
from pypinyin import lazy_pinyin
from tortoise.exceptions import DoesNotExist
from audio_separator.separator import Separator
from karaoke.results import Result
from karaoke.models import Files, History, FileList, HistoryList, SongTag, SongTagRelation, SongTagResponse, FileListWithTags, HistoryListWithTags
from settings import logger, FILE_PATH, PAGE_SIZE, VIDEO_PATH


clients: List[asyncio.Queue] = []
ffmpeg_cmd = 'ffmpeg'

# 任务管理字典，用于存储人声分离任务状态
tasks: Dict[str, dict] = {}
# 并发控制：最大 3 个并行处理
task_semaphore = asyncio.Semaphore(3)


async def broadcast_data(data: dict):
    for client in clients[:]:
        try:
            await client.put(json.dumps(data, ensure_ascii=False))
        except:
            logger.error(traceback.format_exc())


async def init_history():
    try:
        songs = await History.filter(is_sing=-1)
        for s in songs:
            s.is_sing = 1
            await s.save()
    except:
        logger.error(traceback.format_exc())


async def upload_file(query) -> Result:
    result = Result()
    query = await query.form()
    file_name = query['file'].filename
    data = query['file'].file
    try:
        file_path = os.path.join(FILE_PATH, file_name)
        song_name = file_name.replace('.mp4', '').replace('_vocals.mp3', '').replace('_accompaniment.mp3', '')
        try:
            file = await Files.get(name=song_name)
        except DoesNotExist:
            file = await Files.create(name=song_name, is_sing=0)
        with open(file_path, 'wb') as f:
            f.write(data.read())
        result.msg = f"{file_name} 上传成功"
        result.data = file.name
        logger.info(result.msg)
    except:
        result.code = 1
        result.data = file_name
        result.msg = "系统错误"
        logger.error(f"{file_name} 上传失败")
        logger.error(traceback.format_exc())
    return result


    return result


async def upload_separate(query) -> Result:
    result = Result()
    query = await query.form()
    file_obj = query['file']
    # 关键点：使用 os.path.basename 剥离路径，防止上传文件夹时包含子目录导致 open() 失败
    file_name = os.path.basename(file_obj.filename)
    data = file_obj.file
    try:
        # 直接保存上传的文件
        file_path = os.path.join(VIDEO_PATH, file_name)
        with open(file_path, 'wb') as f:
            f.write(data.read())
        
        logger.info(f"文件 {file_name} 上传成功，正在创建后台分离任务...")
        
        # 创建任务ID
        task_id = uuid.uuid4().hex
        tasks[task_id] = {
            "id": task_id,
            "name": file_name,
            "status": "pending",
            "msg": "等待中...",
            "update_time": asyncio.get_event_loop().time()
        }
        
        # 启动后台任务
        asyncio.create_task(run_separation_background(task_id, file_name))
        
        result.msg = "已创建后台任务"
        result.data = {"task_id": task_id}
            
    except Exception as e:
        result.code = 1
        result.msg = f"创建任务失败: {str(e)}"
        logger.error(f"{file_name} 后台分离任务创建失败")
        logger.error(traceback.format_exc())
    return result


async def run_separation_background(task_id: str, file_name: str):
    """后台运行分离任务的协程，支持并发限制和排队"""
    try:
        tasks[task_id]["status"] = "pending"
        tasks[task_id]["msg"] = "排队中..."
        tasks[task_id]["update_time"] = asyncio.get_event_loop().time()
        
        # 使用信号量限制并发数
        async with task_semaphore:
            tasks[task_id]["status"] = "processing"
            tasks[task_id]["msg"] = "正在分离人声..."
            tasks[task_id]["update_time"] = asyncio.get_event_loop().time()
            
            # 调用现有的分离逻辑
            res = await separate_audio(file_name)
            
            if res.code == 0:
                tasks[task_id]["status"] = "success"
                tasks[task_id]["msg"] = "分离成功并已入库"
            else:
                tasks[task_id]["status"] = "failed"
                tasks[task_id]["msg"] = res.msg
            
    except Exception as e:
        logger.error(f"任务 {task_id} 处理出错: {str(e)}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["msg"] = f"系统内部错误: {str(e)}"
    finally:
        tasks[task_id]["update_time"] = asyncio.get_event_loop().time()


async def get_all_tasks() -> Result:
    """获取所有任务状态"""
    result = Result()
    # 任务清理逻辑：清理超过 1 小时的已完成任务
    now = asyncio.get_event_loop().time()
    task_ids_to_remove = [tid for tid, t in tasks.items() 
                          if (t["status"] in ["success", "failed"]) and (now - t["update_time"] > 3600)]
    for tid in task_ids_to_remove:
        tasks.pop(tid, None)

    # 按时间排序返回最近的 50 个任务
    sorted_tasks = sorted(tasks.values(), key=lambda x: x["update_time"], reverse=True)[:50]
    result.data = sorted_tasks
    return result


async def get_task_status(task_id: str) -> Result:
    """获取单个任务状态"""
    result = Result()
    if task_id in tasks:
        result.data = tasks[task_id]
    else:
        result.code = 1
        result.msg = "任务不存在"
    return result


async def get_list(q: str, page: int) -> Result:
    result = Result()
    try:
        if q:
            files = await Files.filter(name__icontains=q).order_by('-id').offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
            total_num = await Files.filter(name__icontains=q).count()
        else:
            files = await Files.all().order_by('-id').offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
            total_num = await Files.all().count()
        file_list = [FileList.from_orm_format(f).dict() for f in files]
        result.data = file_list
        result.page = page
        result.total = len(result.data)
        result.totalPage = (total_num + PAGE_SIZE - 1) // PAGE_SIZE
        logger.info("查询歌曲列表成功 ~")
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def delete_song(file_id: str) -> Result:
    result = Result()
    try:
        ids = [int(i) for i in file_id.split(',')]
        for i in ids:
            file = await Files.get(id=i)
            if os.path.exists(f"{FILE_PATH}/{file.name}.mp4"):
                os.remove(f"{FILE_PATH}/{file.name}.mp4")
            if os.path.exists(f"{FILE_PATH}/{file.name}_vocals.mp3"):
                os.remove(f'{FILE_PATH}/{file.name}_vocals.mp3')
            if os.path.exists(f"{FILE_PATH}/{file.name}_accompaniment.mp3"):
                os.remove(f'{FILE_PATH}/{file.name}_accompaniment.mp3')
            try:
                history = await History.get(id=i)
                await history.delete()
            except DoesNotExist:
                pass
            await file.delete()
        result.msg = f"删除成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def delete_history(file_id: int) -> Result:
    result = Result()
    try:
        history = await History.get(id=file_id)
        await history.delete()
        result.msg = f"{history.name} 播放记录删除成功"
        await broadcast_data({"code": 8})
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def sing_song(file_id: int) -> Result:
    result = Result()
    try:
        msg_list = []
        file = await Files.get(id=file_id)
        if file.is_sing == 0:
            if not os.path.exists(f"{FILE_PATH}/{file.name}.mp4"):
                msg_list.append("视频文件不存在")
            if not os.path.exists(f"{FILE_PATH}/{file.name}_vocals.mp3"):
                msg_list.append("人声文件不存在")
            if not os.path.exists(f"{FILE_PATH}/{file.name}_accompaniment.mp3"):
                msg_list.append("伴奏文件不存在")
            if len(msg_list) > 0:
                result.code = 1
                result.msg = '，'.join(msg_list)
                return result
            else:
                file.is_sing = 1
                await file.save()
                _ = await History.create(id=file.id, name=file.name)
                await broadcast_data({"code": 8})
        else:
            try:
                history = await History.get(id=file.id)
                if history.is_sing == 1:
                    history.is_sing = 0
                    history.is_top = 0
                    await history.save()
            except DoesNotExist:
                _ = await History.create(id=file.id, name=file.name, is_sing=0, is_top=0)
            finally:
                await broadcast_data({"code": 8})
        result.msg = f"{file.name} 点歌成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def history_list(query_type: str) -> Result:
    result = Result()
    try:
        if query_type == "history":
            songs = await History.filter(is_sing=1).order_by('-update_time').offset(0).limit(200)
            msg = "查询K歌历史列表成功"
        elif query_type == "usually":
            songs = await History.all().order_by('-times').offset(0).limit(200)
            msg = "查询经常K歌的歌曲列表成功"
        elif query_type == "pendingAll":
            songs = await History.filter(is_sing=-1)
            songs = songs + await History.filter(is_sing=0, is_top=1).order_by('-update_time')
            songs = songs + await History.filter(is_sing=0, is_top=0).order_by('update_time')
            msg = "查询已点列表的歌曲成功"
        else:
            songs = await History.filter(is_sing=-1)
            songs = songs + await History.filter(is_sing=0, is_top=1).order_by('-update_time')
            songs = songs + await History.filter(is_sing=0, is_top=0).order_by('update_time').offset(0).limit(4)
            msg = "查询已点列表最近的歌曲成功"
        song_list = [HistoryList.from_orm(f).dict() for f in songs]
        result.data = song_list
        result.total = len(result.data)
        logger.info(msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def set_top(file_id: int) -> Result:
    result = Result()
    try:
        history = await History.get(id=file_id)
        history.is_top = 1
        await history.save()
        result.msg = f"{history.name} 置顶成功"
        await broadcast_data({"code": 8})
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def set_singing(file_id: int) -> Result:
    result = Result()
    try:
        history = await History.get(id=file_id)
        history.is_sing = -1
        history.is_top = 0
        await history.save()
        result.msg = f"{history.name} 设置-1成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def set_singed(file_id: int) -> Result:
    result = Result()
    try:
        history = await History.get(id=file_id)
        history.is_sing = 1
        history.is_top = 0
        history.times = history.times + 1
        await history.save()
        result.msg = f"{history.name} 设置1成功"
        await broadcast_data({"code": 8})
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def upload_video(query) -> Result:
    result = Result()
    query = await query.form()
    file_name = query['file'].filename
    data = query['file'].file
    try:
        file_format = file_name.split(".")[-1]
        name = file_name.replace(f".{file_format}", "")
        file_path = os.path.join(VIDEO_PATH, f"{name}_origin.{file_format}")
        with open(file_path, 'wb') as f:
            f.write(data.read())
        result.msg = f"{file_name} 上传成功"
        result.data = file_name
        logger.info(result.msg)
    except:
        result.code = 1
        result.data = file_name
        result.msg = "系统错误"
        logger.error(f"{file_name} 上传失败")
        logger.error(traceback.format_exc())
    return result


async def deal_video(file_name: str) -> Result:
    result = Result()
    try:
        file_name = unquote(file_name)
        name = file_name.replace(".mp4", "")
        mp4_file = os.path.join(VIDEO_PATH, f"{name}_origin.mp4")
        mp3_file = os.path.join(VIDEO_PATH, f"{name}.wav")
        cmd1 = [ffmpeg_cmd, '-i', mp4_file, '-q:a', '0', '-map', 'a', mp3_file]
        subprocess.run(cmd1, check=True)
        no_voice_file = os.path.join(VIDEO_PATH, f"{name}_voice.mp4")
        cmd2 = [ffmpeg_cmd, '-i', mp4_file, '-an', '-vcodec', 'copy', no_voice_file]
        subprocess.run(cmd2, check=True)
        video_file = os.path.join(VIDEO_PATH, f"{name}.mp4")
        cmd3 = [ffmpeg_cmd, '-i', no_voice_file, '-map_metadata', '0', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', video_file]
        subprocess.run(cmd3, check=True)
        result.data = {"mp3": f"{name}.wav", "video": f"{name}.mp4"}
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def convert_video(file_name: str) -> Result:
    result = Result()
    try:
        file_name = unquote(file_name)
        file_format = file_name.split(".")[-1]
        name = file_name.replace(f".{file_format}", "")
        audio_file = os.path.join(VIDEO_PATH, f"{name}_origin.{file_format}")
        mp4_file = os.path.join(VIDEO_PATH, f"{name}.mp4")
        cmd = [ffmpeg_cmd, '-i', audio_file, '-c:v', 'libx264', '-c:a', 'aac', mp4_file]
        subprocess.run(cmd, check=True)
        result.data = {"mp4": f"{name}.mp4", "video": f"{name}.{file_format}"}
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def convert_audio(file_name: str) -> Result:
    result = Result()
    try:
        file_name = unquote(file_name)
        file_format = file_name.split(".")[-1]
        name = file_name.replace(f".{file_format}", "")
        audio_file = os.path.join(VIDEO_PATH, f"{name}_origin.{file_format}")
        mp3_file = os.path.join(VIDEO_PATH, f"{name}.mp3")
        cmd = [ffmpeg_cmd, '-i', audio_file, '-codec:a', 'libmp3lame', mp3_file]
        subprocess.run(cmd, check=True)
        result.data = {"mp3": f"{name}.mp3", "audio": f"{name}.{file_format}"}
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def separate_audio(file_name: str) -> Result:
    result = Result()
    try:
        # 确保只处理文件名部分，防止路径干扰
        file_name = os.path.basename(unquote(file_name))
        file_format = file_name.split(".")[-1]
        name = file_name.replace(f".{file_format}", "")
        
        # 输入文件路径，直接使用上传的文件名
        input_file = os.path.join(VIDEO_PATH, file_name)
        # 兜底：如果直接匹配不到，尝试查找带有 _origin 的文件（兼容旧逻辑）
        if not os.path.exists(input_file):
            input_file = os.path.join(VIDEO_PATH, f"{name}_origin.{file_format}")
            
        if not os.path.exists(input_file):
            result.code = 1
            result.msg = f"找不到待分离的文件: {file_name}"
            return result

        logger.info(f"开始对 {input_file} 进行人声分离...")
        
        # 局部初始化分离器，避免全局单例在多任务并发时的 NoneType 竞争问题
        # 虽然这会增加一点内存开销，但对于 CPU 运行模式来说更稳定
        loop = asyncio.get_event_loop()
        
        def run_separation():
            separator = Separator(output_format="mp3", output_dir=VIDEO_PATH)
            separator.load_model(model_filename='UVR-MDX-NET-Inst_HQ_3.onnx')
            return separator.separate(input_file)
            
        output_files = await loop.run_in_executor(None, run_separation)
        
        if len(output_files) >= 2:
            # 基础歌曲名称
            song_name = name.replace("_origin", "")
            
            # 移动并重命名文件到曲库目录
            vocals_path = os.path.join(FILE_PATH, f"{song_name}_vocals.mp3")
            accompaniment_path = os.path.join(FILE_PATH, f"{song_name}_accompaniment.mp3")
            
            for out_file in output_files:
                # 确保使用绝对路径，audio-separator 可能返回的是相对于 output_dir 的文件名
                full_out_path = out_file if os.path.isabs(out_file) else os.path.join(VIDEO_PATH, out_file)
                
                if 'Vocals' in out_file:
                    shutil.move(full_out_path, vocals_path)
                elif 'Instrumental' in out_file:
                    shutil.move(full_out_path, accompaniment_path)
                else:
                    if not os.path.exists(vocals_path):
                        shutil.move(full_out_path, vocals_path)
                    elif not os.path.exists(accompaniment_path):
                        shutil.move(full_out_path, accompaniment_path)

            # 检查视频文件（即上传的文件本身或处理后的视频）
            # 优先使用原上传文件作为视频源（如果是 MP4）
            video_source = input_file if file_format.lower() == 'mp4' else os.path.join(VIDEO_PATH, f"{song_name}.mp4")
            video_dest = os.path.join(FILE_PATH, f"{song_name}.mp4")
            
            if os.path.exists(video_source):
                # 如果源和目标不是同一个文件，则移动
                if os.path.abspath(video_source) != os.path.abspath(video_dest):
                    shutil.move(video_source, video_dest)
            
            # 更新数据库
            try:
                file_record = await Files.get(name=song_name)
            except DoesNotExist:
                file_record = await Files.create(name=song_name, is_sing=0)
            
            # 检查是否三个文件都凑齐了，凑齐了就设置 is_sing = 1
            if os.path.exists(os.path.join(FILE_PATH, f"{song_name}.mp4")) and \
               os.path.exists(os.path.join(FILE_PATH, f"{song_name}_vocals.mp3")) and \
               os.path.exists(os.path.join(FILE_PATH, f"{song_name}_accompaniment.mp3")):
                file_record.is_sing = 1
                await file_record.save()

            result.msg = "人声分离完成并已自动加入曲库"
            result.data = song_name
            logger.info(result.msg)
        else:
            result.code = 1
            result.msg = "人声分离失败，未生成预期的文件"
            
    except Exception as e:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = f"人声分离出错: {str(e)}"
    return result


async def rename_song(file_id: int, new_name: str) -> Result:
    result = Result()
    try:
        file = await Files.get(id=file_id)
        old_name = file.name
        
        # 检查新名称是否已存在
        if old_name != new_name:
            existing_file = await Files.filter(name=new_name).first()
            if existing_file:
                result.code = 1
                result.msg = f"歌曲名称 {new_name} 已存在，请使用其他名称"
                logger.warning(result.msg)
                return result
                
        # 重命名文件
        if os.path.exists(f"{FILE_PATH}/{old_name}.mp4"):
            os.rename(f"{FILE_PATH}/{old_name}.mp4", f"{FILE_PATH}/{new_name}.mp4")
        if os.path.exists(f"{FILE_PATH}/{old_name}_vocals.mp3"):
            os.rename(f"{FILE_PATH}/{old_name}_vocals.mp3", f"{FILE_PATH}/{new_name}_vocals.mp3")
        if os.path.exists(f"{FILE_PATH}/{old_name}_accompaniment.mp3"):
            os.rename(f"{FILE_PATH}/{old_name}_accompaniment.mp3", f"{FILE_PATH}/{new_name}_accompaniment.mp3")
        
        # 更新数据库记录
        file.name = new_name
        await file.save()
        
        # 如果存在历史记录，也需要更新
        try:
            history = await History.get(id=file_id)
            history.name = new_name
            await history.save()
        except DoesNotExist:
            pass
            
        result.msg = f"歌曲 {old_name} 重命名为 {new_name} 成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


# 标签相关API函数
async def get_all_tags(page: int = 1, q: str = "", initial: str = "") -> Result:
    result = Result()
    try:
        query = SongTag.all().order_by('name')
        if q:
            query = query.filter(name__icontains=q)
        
        tags = await query
        
        tag_list = [SongTagResponse.from_orm_format(tag).dict() for tag in tags]
        
        # 为每个标签添加拼音首字母
        for tag in tag_list:
            pinyin = lazy_pinyin(tag['name'])
            if pinyin:
                tag['initial'] = pinyin[0][0].upper()
            else:
                tag['initial'] = '#'

        # 按首字母筛选
        if initial:
            initial = initial.upper()
            if initial == 'OTHER':
                tag_list = [t for t in tag_list if not t['initial'].isalpha()]
            else:
                tag_list = [t for t in tag_list if t['initial'] == initial]

        # 分页处理
        total_num = len(tag_list)
        if page > 0:
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            result.data = tag_list[start:end]
            result.totalPage = (total_num + PAGE_SIZE - 1) // PAGE_SIZE
            result.page = page
            result.total = total_num
        else:
            result.data = tag_list
            result.total = total_num
            result.totalPage = 1
            result.page = 1
            
        result.msg = "获取标签列表成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def create_tag(name: str, color: str = '#007bff') -> Result:
    result = Result()
    try:
        # 检查标签是否已存在
        existing_tag = await SongTag.filter(name=name).first()
        if existing_tag:
            result.code = 1
            result.msg = f"标签 '{name}' 已存在"
            return result
        
        tag = await SongTag.create(name=name, color=color)
        result.data = SongTagResponse.from_orm_format(tag)
        result.msg = f"标签 '{name}' 创建成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def update_tag(tag_id: int, name: str, color: str) -> Result:
    result = Result()
    try:
        tag = await SongTag.get(id=tag_id)
        tag.name = name
        tag.color = color
        await tag.save()
        result.data = SongTagResponse.from_orm_format(tag)
        result.msg = f"标签更新成功"
        logger.info(result.msg)
    except DoesNotExist:
        result.code = 1
        result.msg = "标签不存在"
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def delete_tag(tag_id: int) -> Result:
    result = Result()
    try:
        tag = await SongTag.get(id=tag_id)
        # 删除标签时同时删除所有关联关系
        await SongTagRelation.filter(tag_id=tag_id).delete()
        await tag.delete()
        result.msg = f"标签 '{tag.name}' 删除成功"
        logger.info(result.msg)
    except DoesNotExist:
        result.code = 1
        result.msg = "标签不存在"
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def get_song_tags(song_id: int) -> Result:
    result = Result()
    try:
        tag_relations = await SongTagRelation.filter(song_id=song_id)
        tag_ids = [rel.tag_id for rel in tag_relations]
        tags = await SongTag.filter(id__in=tag_ids)
        tag_list = [SongTagResponse.from_orm_format(tag) for tag in tags]
        result.data = tag_list
        result.msg = "获取歌曲标签成功"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def add_song_tag(song_id: int, tag_id: int) -> Result:
    result = Result()
    try:
        # 检查歌曲是否存在
        song = await Files.get(id=song_id)
        # 检查标签是否存在
        tag = await SongTag.get(id=tag_id)
        
        # 检查关联是否已存在
        existing_relation = await SongTagRelation.filter(song_id=song_id, tag_id=tag_id).first()
        if existing_relation:
            result.code = 1
            result.msg = "该标签已添加到此歌曲"
            return result
        
        await SongTagRelation.create(song_id=song_id, tag_id=tag_id)
        result.msg = f"标签 '{tag.name}' 添加到歌曲 '{song.name}' 成功"
        logger.info(result.msg)
    except DoesNotExist:
        result.code = 1
        result.msg = "歌曲或标签不存在"
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def remove_song_tag(song_id: int, tag_id: int) -> Result:
    result = Result()
    try:
        relation = await SongTagRelation.filter(song_id=song_id, tag_id=tag_id).first()
        if not relation:
            result.code = 1
            result.msg = "未找到该标签关联"
            return result
        
        await relation.delete()
        result.msg = "标签已从歌曲中移除"
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def get_list_with_tags(q: str, page: int, tag_id: int = None, sort_by_tag: bool = False) -> Result:
    result = Result()
    try:
        # 1. 基础查询
        query = Files.all()
        if q:
            query = query.filter(name__icontains=q)
        
        # 2. 标签筛选
        if tag_id:
            song_ids = await SongTagRelation.filter(tag_id=tag_id).values_list('song_id', flat=True)
            query = query.filter(id__in=song_ids)
        
        # 3. 排序和分页
        if sort_by_tag:
            # 如果需要按照标签排序，我们需要获取所有符合筛选条件的歌曲
            # 为了效率，我们批量获取所有关系和标签
            all_files = await query.all()
            if not all_files:
                result.data = []
                result.page = page
                result.total = 0
                result.totalPage = 0
                return result
                
            all_file_ids = [f.id for f in all_files]
            
            # 批量获取关联
            all_relations = await SongTagRelation.filter(song_id__in=all_file_ids).all()
            tag_ids = list(set(r.tag_id for r in all_relations))
            
            # 批量获取标签
            all_tags = await SongTag.filter(id__in=tag_ids).all()
            tag_map = {tag.id: tag for tag in all_tags}
            
            # 建立歌曲ID到标签列表的映射
            song_tag_map = collections.defaultdict(list)
            for r in all_relations:
                tag_obj = tag_map.get(r.tag_id)
                if tag_obj:
                    song_tag_map[r.song_id].append(tag_obj)
            
            # 转换为带标签的对象列表
            all_file_list = []
            for f in all_files:
                tags = song_tag_map[f.id]
                # 按照标签名称内部排序
                tags.sort(key=lambda t: t.name)
                
                c = f.create_time.strftime("%Y-%m-%d %H:%M:%S")
                m = f.update_time.strftime("%Y-%m-%d %H:%M:%S")
                tag_list = [SongTagResponse.from_orm_format(t) for t in tags]
                
                all_file_list.append({
                    "id": f.id,
                    "name": f.name,
                    "is_sing": f.is_sing,
                    "create_time": c,
                    "update_time": m,
                    "tags": tag_list
                })
            
            # 按照第一个标签的名称排序，没有标签的排在最后
            # 考虑到可能有多个标签，这里取第一个
            all_file_list.sort(key=lambda x: (x['tags'][0]['name'] if x['tags'] else 'zzzzzzzz'))
            
            total_num = len(all_file_list)
            result.totalPage = (total_num + PAGE_SIZE - 1) // PAGE_SIZE
            result.page = page
            result.total = total_num
            
            # 手动分页
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            result.data = all_file_list[start:end]
            
        else:
            # 普通排序（按ID倒序，即最新添加排在最前）
            total_num = await query.count()
            files = await query.order_by('-id').offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
            
            file_list = []
            for f in files:
                file_with_tags = await FileListWithTags.from_orm_format(f)
                file_list.append(file_with_tags.dict())
            
            result.data = file_list
            result.page = page
            result.total = len(result.data)
            result.totalPage = (total_num + PAGE_SIZE - 1) // PAGE_SIZE
            
        logger.info("查询带标签的歌曲列表成功 ~")
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result


async def auto_tag_all_songs(mode: str = "existing") -> Result:
    result = Result()
    try:
        # 获取所有歌曲
        songs = await Files.all()
        if not songs:
            result.code = 1
            result.msg = "曲库中没有歌曲"
            return result

        count = 0
        tag_count = 0

        if mode == "existing":
            # 1. 获取数据库中所有已存在的标签
            existing_tags = await SongTag.all()
            tag_dict = {tag.name.lower(): tag for tag in existing_tags if tag.name != "其他"}
            
            # 确保 "其他" 标签存在
            other_tag = await SongTag.filter(name="其他").first()
            if not other_tag:
                other_tag = await SongTag.create(name="其他", color="#6c757d")
            
            for song in songs:
                song_updated = False
                matched = False
                # 对于每一首歌曲，检查是否包含任何现有标签
                for tag_name_lower, tag_obj in tag_dict.items():
                    if tag_name_lower in song.name.lower():
                        # 检查关联是否已存在
                        existing_relation = await SongTagRelation.filter(song_id=song.id, tag_id=tag_obj.id).first()
                        if not existing_relation:
                            await SongTagRelation.create(song_id=song.id, tag_id=tag_obj.id)
                            tag_count += 1
                            song_updated = True
                        matched = True
                
                # 如果没有任何标签匹配，则打上 "其他"
                if not matched:
                    # 额外检查：如果该歌曲已经手动设置了除了“其他”之外的标签，则不再打“其他”
                    # 先获取该歌曲所有的标签ID
                    song_existing_tag_relations = await SongTagRelation.filter(song_id=song.id).all()
                    song_existing_tag_ids = [r.tag_id for r in song_existing_tag_relations]
                    
                    # 检查这些标签ID中是否包含非“其他”标签
                    has_real_tag = False
                    if song_existing_tag_ids:
                        # 排除掉“其他”标签的ID，看是否还有剩余
                        real_tags_count = await SongTag.filter(id__in=song_existing_tag_ids).exclude(name="其他").count()
                        if real_tags_count > 0:
                            has_real_tag = True
                    
                    if not has_real_tag:
                        existing_relation = await SongTagRelation.filter(song_id=song.id, tag_id=other_tag.id).first()
                        if not existing_relation:
                            await SongTagRelation.create(song_id=song.id, tag_id=other_tag.id)
                            tag_count += 1
                            song_updated = True
                
                if song_updated:
                    count += 1
            
            result.msg = f"基于已有标签打标签完成。共遍历 {len(songs)} 首歌曲，为 {count} 首歌曲添加了 {tag_count} 个标签。"

        elif mode == "csv":
            # 2. 从 SENDER.CSV 加载歌手信息 (优先) 或 singer_.csv
            csv_file_path = "/Users/li/Code/github/karaoke/static/file/SENDER.CSV"
            if not os.path.exists(csv_file_path):
                csv_file_path = "/Users/li/Code/github/karaoke/static/file/singer_.csv"
            
            csv_singers = []
            if os.path.exists(csv_file_path):
                with open(csv_file_path, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    for row in reader:
                        if len(row) >= 2:
                            singer_name = row[1].strip()
                            if singer_name:
                                csv_singers.append(singer_name)
            
            if not csv_singers:
                result.code = 1
                result.msg = "CSV文件为空或不存在"
                return result

            # 获取所有现有标签以便重用
            existing_tags = await SongTag.all()
            tag_dict = {tag.name.lower(): tag for tag in existing_tags}

            for song in songs:
                song_updated = False
                # 对于每一首歌曲，检查是否包含 CSV 中的歌手名
                for singer_name in csv_singers:
                    singer_name_lower = singer_name.lower()
                    if singer_name_lower in song.name.lower():
                        # 获取或创建标签
                        if singer_name_lower in tag_dict:
                            tag_obj = tag_dict[singer_name_lower]
                        else:
                            tag_obj = await SongTag.create(name=singer_name, color='#007bff')
                            tag_dict[singer_name_lower] = tag_obj
                        
                        # 检查关联是否已存在
                        existing_relation = await SongTagRelation.filter(song_id=song.id, tag_id=tag_obj.id).first()
                        if not existing_relation:
                            await SongTagRelation.create(song_id=song.id, tag_id=tag_obj.id)
                            tag_count += 1
                            song_updated = True
                
                if song_updated:
                    count += 1
            
            result.msg = f"基于 CSV 文件打标签完成。共遍历 {len(songs)} 首歌曲，为 {count} 首歌曲添加了 {tag_count} 个标签。"
        
        logger.info(result.msg)
    except:
        logger.error(traceback.format_exc())
        result.code = 1
        result.msg = "系统错误"
    return result
