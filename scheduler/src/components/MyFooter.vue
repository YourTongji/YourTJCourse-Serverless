<template>
    <a-layout>
        <a-layout-footer>
            <div class="text-center">
                <p>基于 <a href="https://github.com/me-shaon/GLWTPL" target="_blank" >GLWTPL</a> 开源</p>
                <p>数据来源：<a href="https://1.tongji.edu.cn" target="_blank">同济大学教学管理信息系统</a></p>
                <p>当前学期数据的更新时间：{{ $store.state.updateTime }}</p>
            </div>
        </a-layout-footer>
    </a-layout>
</template>

<script lang="ts">
import { errorNotify, successNotify } from '@/utils/notify';
import { isUpToDate } from '@/utils/misc';
import { Modal } from 'ant-design-vue';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';
import { createVNode } from 'vue';
import { getLatestUpdateTime } from '@/services/api';
import { 
    fetchLatestCourseInfo, 
    detectCourseChanges, 
    applyCourseSync
} from '@/utils/courseSync';
import { renderSyncChanges } from '@/utils/syncRender';
import { insertOccupied } from '@/utils/courseManipulate';
import type { occupyCell, courseOnTable } from '@/utils/myInterface';

export default {
    data() {
        return {
            // updateTime: ''
        }
    },
    mounted() {
        this.getUpdateTime();
    },
    methods: {
        async getUpdateTime() {
            try {
                const latestTime = await getLatestUpdateTime();

                this.$store.commit("loadSolidifyTime");
                this.$store.commit("setLatestUpdateTime", latestTime);

                if (this.$store.state.updateTime === '') {
                    // 初次加载，不弹窗
                    this.$store.commit("syncLatestData");
                    return;
                }
                else if (isUpToDate(this.$store.state.updateTime, latestTime)) {
                    this.$store.commit("setDataOutdated", false);
                    return;
                }
                else {
                    // 数据过期，调用智能同步逻辑
                    this.$store.commit("setDataOutdated", true);
                    await this.handleSmartSync();
                }
            }
            catch (error: unknown) {
                const err = error as { response?: { data?: { msg?: string } } };
                errorNotify(err.response?.data?.msg || '获取更新时间失败');
            }
        },
        async handleSmartSync() {
            try {
                // 确保从 localStorage 加载课程数据
                this.$store.commit("loadSolidify");
                
                const stagedCourses = this.$store.state.commonLists.stagedCourses;
                const selectedCourses = this.$store.state.commonLists.selectedCourses;
                const calendarId = this.$store.state.majorSelected.calendarId;
                
                // 获取专业信息（用于判断 isExclusive）
                // 注意：majorSelected.major 实际上存储的是专业代码 (code)
                const majorInfo = this.$store.state.majorSelected.grade && this.$store.state.majorSelected.major
                    ? {
                        grade: this.$store.state.majorSelected.grade,
                        code: this.$store.state.majorSelected.major  // major 字段存储的是 code
                    }
                    : undefined;

                // 如果没有课程，提示用户直接更新时间
                if (stagedCourses.length === 0 && selectedCourses.length === 0) {
                    this.$store.commit("syncLatestData");  // 静默更新时间
                    return;
                }

                // 获取最新课程信息
                const latestCourses = await fetchLatestCourseInfo(calendarId, stagedCourses, selectedCourses, majorInfo);

                // 检测课程变更
                const syncResult = detectCourseChanges(
                    stagedCourses,
                    latestCourses,
                    selectedCourses,
                    this.$store.state.occupied
                );

                if (!syncResult.hasChanges) {
                    // 没有变更，静默更新时间
                    this.$store.commit("setUpdateTime", this.$store.state.latestUpdateTime);
                    this.$store.commit("setDataOutdated", false);
                    // 数据已更新但课程无变化，已自动同步时间
                    return;
                }

                // 显示确认对话框 - 使用结构化内容
                Modal.confirm({
                    title: '检测到课程变更',
                    icon: createVNode(ExclamationCircleOutlined),
                    content: createVNode('div', { style: { maxHeight: '500px', overflow: 'auto' } }, 
                        renderSyncChanges(syncResult.changes)
                    ),
                    width: 700,
                    okText: '立即同步',
                    okType: 'primary',
                    cancelText: '稍后处理',
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
                                        insertOccupied(newOccupied, detail.arrangementInfo, detail.code, course.courseNameReserved);
                                        
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
                            errorNotify('同步失败，请稍后重试');
                        }
                    },
                    onCancel: () => {
                        console.log("用户选择稍后处理课程同步");
                    }
                });

            } catch (error) {
                console.error('智能同步失败:', error);
                
                // 降级方案：提供清除缓存选项
                Modal.confirm({
                    title: '数据过期提示',
                    icon: createVNode(ExclamationCircleOutlined),
                    content: '检测到后端课程数据已更新，但无法自动同步课程信息。您可以选择清除缓存并使用最新数据，或稍后手动同步。',
                    okText: '清除缓存',
                    okType: 'danger',
                    cancelText: '稍后处理',
                    onOk: () => {
                        this.$store.commit("syncLatestData");
                        successNotify("缓存已清除，请重新选择课程");
                    }
                });
            }
        }
    }
}
</script>
