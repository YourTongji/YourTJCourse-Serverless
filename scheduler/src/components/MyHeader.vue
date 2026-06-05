<template>
    <a-layout-header
        class="flex flex-col md:flex-row justify-between md:items-center gap-3"
        style="background-color: #f6f8fa; height: auto; padding: 10px 12px"
    >
        <div class="flex items-center justify-between w-full md:w-auto">
            <img
                src="../assets/myLogo.png"
                alt="排课模拟器"
                width="200"
                height="40"
                loading="eager"
                decoding="async"
                fetchpriority="high"
                class="h-10 w-[200px] max-w-[60vw] object-contain"
            />
        </div>

        <div class="w-full md:w-auto">
            <div v-if="$store.state.flags.isDataOutdated" class="mb-2 md:mb-0 md:mr-2 inline-block w-full md:w-auto">
                <a-button size="small" type="primary" danger class="w-full md:w-auto" @click="syncData">
                    <div class="flex flex-row space-x-2 items-center justify-center">
                        <p class="text-xs md:text-sm">同步最新数据</p>
                        <div><SyncOutlined /></div>
                    </div>
                </a-button>
            </div>

            <div class="grid grid-cols-3 gap-2 md:flex md:flex-row md:items-center md:gap-4 md:justify-end">
                <div>
                    <a-dropdown>
                        <template #overlay>
                            <a-menu class="text-center">
                            <a-menu-item key="wakeUp" @click="wakeUpCSV">
                                <div class="flex flex-row space-x-2 items-center">
                                    <p>WakeUp 课程表支持的 csv 格式</p>
                                    <p><a href="https://www.wakeup.fun/" target="_blank">[官网]</a></p>
                                </div>
                            </a-menu-item>
                            <a-menu-item key="excel" @click="helpExcel">
                                <p>辅助选课的 xls 文件</p>
                            </a-menu-item>
                            </a-menu>
                        </template>
                        <a-button size="small" class="w-full">
                            <div class="inline-flex w-full items-center justify-center gap-1.5 leading-none">
                                <span class="text-xs md:text-sm leading-none">导出为</span>
                                <span class="inline-flex items-center leading-none"><ExportOutlined /></span>
                            </div>
                        </a-button>
                    </a-dropdown>
                </div>
                <div>
                    <a-button size="small" class="w-full" @click="readTheDocs">
                        <div class="inline-flex w-full items-center justify-center gap-1.5 leading-none">
                            <span class="text-xs md:text-sm leading-none">帮助文档</span>
                            <span class="inline-flex items-center leading-none"><ReadOutlined /></span>
                        </div>
                    </a-button>
                </div>
                <div>
                    <a-dropdown>
                        <template #overlay>
                            <a-menu class="text-center">
                            <a-menu-item key="tongji">
                                <a href="https://1.tongji.edu.cn" target="_blank">1 系统</a>
                            </a-menu-item>
                            <a-menu-item key="courseSystem">
                                <a href="https://tongji.xialing.icu" target="_blank">课程检索</a>
                            </a-menu-item>
                            <a-menu-item key="wlc">
                                <a href="https://1.tongji.icu" target="_blank">乌龙茶</a>
                            </a-menu-item>
                            <a-menu-item key="github">
                                <div class="flex flex-row space-x-2 items-center">
                                    <div><GithubOutlined /></div>
                                    <div><a href="https://github.com/XiaLing233/tongji-course-scheduler" target="_blank" style="color: inherit">项目仓库</a></div>
                                </div>
                            </a-menu-item>
                            </a-menu>
                        </template>
                        <a-button size="small" class="w-full">
                            <div class="inline-flex w-full items-center justify-center gap-1.5 leading-none">
                                <span class="text-xs md:text-sm leading-none">友情链接</span>
                                <span class="inline-flex items-center leading-none"><LinkOutlined /></span>
                            </div>
                        </a-button>
                    </a-dropdown>
                </div>
            </div>
        </div>
    </a-layout-header>
</template>

<script lang="ts">
import { ExportOutlined, GithubOutlined, LinkOutlined, ReadOutlined, SyncOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import { codesToJsonForCSV, jsonToCSV, downloadCSV } from '@/utils/csvRelated';
import { codesToJsonForXLS, jsonToXLS, downloadXLS } from '@/utils/xlsRelated';
import { errorNotify, successNotify } from '@/utils/notify';
import { Modal } from 'ant-design-vue';
import { createVNode } from 'vue';
import { 
    fetchLatestCourseInfo, 
    detectCourseChanges, 
    applyCourseSync
} from '@/utils/courseSync';
import { renderSyncChanges } from '@/utils/syncRender';
import { insertOccupied } from '@/utils/courseManipulate';
import type { occupyCell, courseOnTable } from '@/utils/myInterface';

export default {
    components: {
        ExportOutlined,
        GithubOutlined,
        ReadOutlined,
        LinkOutlined,
        SyncOutlined
    },
    methods: {
        async syncData() {
            try {
                // 获取当前的stagedCourses和selectedCourses
                const stagedCourses = this.$store.state.commonLists.stagedCourses;
                const selectedCourses = this.$store.state.commonLists.selectedCourses;
                const calendarId = this.$store.state.majorSelected.calendarId;

                if (!calendarId) {
                    errorNotify('未选择学期，无法同步');
                    return;
                }

                if (stagedCourses.length === 0 && selectedCourses.length === 0) {
                    // 没有课程，直接同步时间即可
                    Modal.confirm({
                        title: '确认同步最新数据',
                        icon: createVNode(ExclamationCircleOutlined),
                        content: '当前没有已选课程，确认同步更新时间？',
                        okText: '确定',
                        okType: 'primary',
                        cancelText: '取消',
                        onOk: () => {
                            this.$store.commit("syncLatestData");
                            successNotify("已同步最新数据");
                        }
                    });
                    return;
                }

                // 获取专业信息（用于判断 isExclusive）
                // 注意：majorSelected.major 实际上存储的是专业代码 (code)
                const majorInfo = this.$store.state.majorSelected.grade && this.$store.state.majorSelected.major
                    ? {
                        grade: this.$store.state.majorSelected.grade,
                        code: this.$store.state.majorSelected.major  // major 字段存储的是 code
                    }
                    : undefined;

                // 显示加载中
                this.$store.commit("setSpin", true);

                // 从后端获取最新课程信息
                const latestCourses = await fetchLatestCourseInfo(calendarId, stagedCourses, selectedCourses, majorInfo);

                // 检测课程变更
                const syncResult = detectCourseChanges(
                    stagedCourses,
                    latestCourses,
                    selectedCourses,
                    this.$store.state.occupied
                );

                this.$store.commit("setSpin", false);

                if (!syncResult.hasChanges) {
                    // 没有变更，直接更新时间
                    Modal.info({
                        title: '课程已是最新',
                        content: '所有课程信息均为最新版本，已自动更新同步时间。',
                        okText: '确定',
                        onOk: () => {
                            this.$store.commit("setUpdateTime", this.$store.state.latestUpdateTime);
                            this.$store.commit("setDataOutdated", false);
                            successNotify("已更新同步时间");
                        }
                    });
                    return;
                }

                // 显示确认对话框
                Modal.confirm({
                    title: '课程同步',
                    icon: createVNode(ExclamationCircleOutlined),
                    content: renderSyncChanges(syncResult.changes),
                    width: 700,
                    bodyStyle: { maxHeight: '500px', overflow: 'auto' },
                    okText: '确认同步',
                    okType: 'primary',
                    cancelText: '取消',
                    onOk: async () => {
                        try {
                            // 应用课程同步
                            const { newStagedCourses, newSelectedCodes } = applyCourseSync(
                                syncResult.changes,
                                stagedCourses,
                                selectedCourses,
                                latestCourses
                            );

                            // 重新构建occupied和timeTableData
                            const newOccupied: occupyCell[][][] = Array(12).fill(null).map(() => 
                                Array(7).fill(undefined).map(() => [])
                            );
                            const newTimeTableData: courseOnTable[] = [];

                            // 重新添加已选课程到课程表
                            newSelectedCodes.forEach(selectedCode => {
                                const courseCode = selectedCode.substring(0, selectedCode.length - 2);
                                const course = newStagedCourses.find(c => c.courseCode === courseCode);
                                
                                if (course) {
                                    const detail = course.courseDetail.find(d => d.code === selectedCode);
                                    if (detail) {
                                        // 添加到occupied
                                        insertOccupied(newOccupied, detail.arrangementInfo, detail.code, course.courseNameReserved);
                                        
                                        // 添加到timeTableData
                                        detail.arrangementInfo.forEach(arrangement => {
                                            newTimeTableData.push({
                                                showText: `${arrangement.teacherAndCode} ${course.courseNameReserved}(${detail.code}) ${arrangement.arrangementText}`,
                                                courseName: course.courseNameReserved,
                                                code: detail.code,
                                                occupyTime: arrangement.occupyTime,
                                                occupyDay: arrangement.occupyDay
                                            });
                                        });
                                    }
                                }
                            });

                            // 提交到store
                            this.$store.commit("smartSyncCourses", {
                                newStagedCourses,
                                newSelectedCodes,
                                newOccupied,
                                newTimeTableData
                            });

                            // 生成成功消息
                            // const closedCount = syncResult.changes.filter(c => c.changeType === 'closed').length;
                            // const conflictCount = syncResult.changes.filter(c => c.changeType === 'conflictAfterUpdate').length;
                            // const changedCount = syncResult.changes.filter(c => c.changeType === 'infoChanged').length;

                            const successMsg = '同步成功！';
                            // if (closedCount > 0) successMsg += ` ${closedCount}门课程已删除，`;
                            // if (conflictCount > 0) successMsg += ` ${conflictCount}门课程已移至备选，`;
                            // if (changedCount > 0) successMsg += ` ${changedCount}门课程已更新`;
                            
                            successNotify(successMsg);
                        } catch (error) {
                            console.error('同步失败:', error);
                            errorNotify('同步失败，请重试');
                        }
                    },
                    onCancel: () => {
                        console.log("User cancelled smart sync");
                    }
                });

            } catch (error) {
                this.$store.commit("setSpin", false);
                console.error('获取课程信息失败:', error);
                
                // 如果获取失败，提供降级选项：清空所有课程
                Modal.confirm({
                    title: '无法获取最新课程信息',
                    icon: createVNode(ExclamationCircleOutlined),
                    content: '无法从服务器获取最新课程信息。您可以选择清空所有课程并同步，或稍后重试。',
                    okText: '清空并同步',
                    okType: 'danger',
                    cancelText: '稍后重试',
                    onOk: () => {
                        this.$store.commit("syncLatestData");
                        successNotify("已清空课程并同步最新数据");
                    }
                });
            }
        },
        async wakeUpCSV() {
            const csv = codesToJsonForCSV(this.$store.state.commonLists.selectedCourses, this.$store.state.commonLists.stagedCourses);
            const csvString = await jsonToCSV(csv);
            downloadCSV(csvString);
        },
        async helpExcel() {
            const xls = codesToJsonForXLS(this.$store.state.commonLists.selectedCourses, this.$store.state.commonLists.stagedCourses);
            const xlsBlob = await jsonToXLS(xls);
            downloadXLS(xlsBlob);
        },
        readTheDocs() {
            window.open('https://xk.xialing.icu/docs/', '_blank');
        }
    }
}
</script>
