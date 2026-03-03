# encoding : utf-8
import time
import re
import pymysql
from selenium import webdriver
import csv
driver = webdriver.Edge()


def get_html_src(url):
    driver.get(url)
    print(f"{url=}")
    print("switch to iframe")
    #切换frame
    driver.switch_to.frame("g_iframe")
    #waiting
    time.sleep(1)
    print("get page source")
    page_src = driver.page_source
    # print(page_src)
    return page_src


def parsebyre(page):
    lis = re.findall(
        r'href="\s?\/artist\?id=(\d*)"\sclass="nm\snm-icn\sf-thide\ss-fc0".*?>(.*?)<\/a>',
        page)
    return lis


def write_to_csv(lis):
    with open('singer.csv', 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        print("write to csv")
        for i in lis:
            writer.writerow(i)
        csvfile.close()

def write_to_csv1(lis):
    with open('singer_.csv', 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        print("write to csv_")
        for i in lis:
            writer.writerow(i)
        csvfile.close()

def getkindsinger(root):
    with open('singer.csv', 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        print("write to csv")
        for i in range(-1, 1):
            url = root + str(i)
            try:
                page = get_html_src(url)
                # print(page)
                lis = parsebyre(page)
                # print(lis)
                for j in lis:
                    writer.writerow(j)
            except:
                print("ERROR")
                continue

    with open('singer_.csv', 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        print("write to csv_")
        for i in range(65, 91):
            url = root + str(i)
            try:
                page = get_html_src(url)
                # print(page)
                lis = parsebyre(page)
                # print(lis)
                for j in lis:
                    writer.writerow(j)
            except:
                continue



# https://music.163.com/#/discover/artist/cat?id=1002&initial=-1
# https://music.163.com/#/discover/artist/cat?id=1001&initial=1002&initial=-1
# 每遍循环没有初始化root导致的问题


def main():
    for i in range(1001, 1004):
        root = 'https://music.163.com/#/discover/artist/cat?id='
        root = root + str(i) + '&initial='
        getkindsinger(root)


main()

driver.close()