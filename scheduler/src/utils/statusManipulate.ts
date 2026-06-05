// 存放了选课状态的函数（已选、备选、未选 | 清除、退课..）

import type { courseInfo } from "./myInterface";

export function defineStatus(courseInfo: courseInfo) : void {
    // 如果有备选的，不管是新选的还是改选的课，外层显示都是备选
    if (courseInfo.courseDetail.some(item => item.status === 1)) {
        courseInfo.status = 1; // 备选
    }
    else if (courseInfo.courseDetail.some(item => item.status === 2)) {
        courseInfo.status = 2; // 已选
    }
    else {
        courseInfo.status = 0; // 未选
    }
}

export function defineAction(courseInfo: courseInfo) : string {
    if (courseInfo.courseDetail.some(item => item.status === 2)) {
        return "退课"; // 如果存在选课状态为已选的课程，那么显示退课，不管有没有未保存的改选
    }
    else {
        return "清除";
    }
}

export function mapStatusToChinese(status: number) : string {
    // console.log("status", status);
    switch (status) {
        case 0:
            return "未选";
        case 1:
            return "备选";
        case 2:
            return "已选";
        default:
            return "未知";
    }
}

export function getTagColor(status: number) : string {
    switch (status) {
        case 2:
            return 'success';
        case 1:
            return 'warning';
        case 0:
            return 'error';
        default:
            return 'default';
    }
}

export function getStatusTextColor(status: number): string {
    switch (status) {
        case 0:
            return 'text-gray-400';
        case 1:
            return 'text-yellow-300';
        case 2:
            return 'text-green-400';
        default:
            return 'text-gray-400';
    }
}