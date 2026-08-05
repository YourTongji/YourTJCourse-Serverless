// 课程同步UI渲染工具
import { h } from 'vue';
import type { CourseChangeInfo } from './myInterface';
import { CourseChangeType } from './myInterface';

/**
 * 渲染课程同步变更列表
 * @param changes 课程变更信息列表
 * @returns VNode数组
 */
export function renderSyncChanges(changes: CourseChangeInfo[]) {
    const closedCourses = changes.filter(c => c.changeType === CourseChangeType.Closed);
    const classClosedCourses = changes.filter(c => c.changeType === CourseChangeType.ClassClosed);
    const conflictCourses = changes.filter(c => c.changeType === CourseChangeType.ConflictAfterUpdate);
    const changedCourses = changes.filter(c => c.changeType === CourseChangeType.InfoChanged);

    const sections = [];

    // 已关课部分
    if (closedCourses.length > 0) {
        sections.push(
            h('div', { style: { marginBottom: '16px' } }, [
                h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' } }, [
                    h('span', { style: { color: '#ff4d4f' } }, '■ '),
                    `已关课 (${closedCourses.length}门)`
                ]),
                ...closedCourses.map(c => 
                    h('div', { 
                        style: { 
                            padding: '8px 12px',
                            marginBottom: '6px',
                            marginLeft: '12px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px',
                            backgroundColor: '#fafafa'
                        } 
                    }, [
                        h('div', { style: { fontSize: '13px', fontWeight: 500 } }, c.courseName),
                        c.details ? h('div', { 
                            style: { 
                                fontSize: '12px', 
                                color: '#666',
                                marginTop: '4px'
                            } 
                        }, c.details) : null
                    ])
                )
            ])
        );
    }

    // 所选班级已关闭部分（课程仍开课，需重新选班）
    if (classClosedCourses.length > 0) {
        sections.push(
            h('div', { style: { marginBottom: '16px' } }, [
                h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' } }, [
                    h('span', { style: { color: '#fa8c16' } }, '■ '),
                    `所选班级已关闭 (${classClosedCourses.length}门)`
                ]),
                ...classClosedCourses.map(c =>
                    h('div', {
                        style: {
                            padding: '8px 12px',
                            marginBottom: '6px',
                            marginLeft: '12px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px',
                            backgroundColor: '#fafafa'
                        }
                    }, [
                        h('div', { style: { fontSize: '13px', fontWeight: 500 } }, c.courseName),
                        h('div', {
                            style: {
                                fontSize: '12px',
                                color: '#666',
                                marginTop: '4px'
                            }
                        }, `${c.details || '所选班级已关闭'}，课程已保留为未选状态，请重新选择班级`)
                    ])
                )
            ])
        );
    }

    // 更新后发生冲突部分
    if (conflictCourses.length > 0) {
        sections.push(
            h('div', { style: { marginBottom: '16px' } }, [
                h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' } }, [
                    h('span', { style: { color: '#fa8c16' } }, '■ '),
                    `更新后发生冲突 (${conflictCourses.length}门)`
                ]),
                ...conflictCourses.map(c => 
                    h('div', { 
                        style: { 
                            padding: '8px 12px',
                            marginBottom: '6px',
                            marginLeft: '12px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px',
                            backgroundColor: '#fafafa'
                        } 
                    }, [
                        h('div', { style: { fontSize: '13px', fontWeight: 500 } }, c.courseName),
                        c.details ? h('div', { 
                            style: { 
                                fontSize: '12px', 
                                color: '#666',
                                marginTop: '4px',
                                whiteSpace: 'pre-line'
                            } 
                        }, c.details) : null,
                        c.conflictWith && !c.details?.includes('与同样变更的课程') ? 
                            h('div', { 
                                style: { 
                                    fontSize: '12px', 
                                    color: '#fa8c16',
                                    marginTop: '4px'
                                } 
                            }, `→ 与 ${c.conflictWith} 冲突`) : null
                    ])
                )
            ])
        );
    }

    // 信息已变更部分
    if (changedCourses.length > 0) {
        sections.push(
            h('div', { style: { marginBottom: '16px' } }, [
                h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' } }, [
                    h('span', { style: { color: '#1890ff' } }, '■ '),
                    `信息已变更 (${changedCourses.length}门)`
                ]),
                ...changedCourses.map(c => 
                    h('div', { 
                        style: { 
                            padding: '8px 12px',
                            marginBottom: '6px',
                            marginLeft: '12px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px',
                            backgroundColor: '#fafafa'
                        } 
                    }, [
                        h('div', { style: { fontSize: '13px', fontWeight: 500 } }, c.courseName),
                        c.details ? h('div', { 
                            style: { 
                                fontSize: '12px', 
                                color: '#666',
                                marginTop: '4px'
                            } 
                        }, c.details) : null
                    ])
                )
            ])
        );
    }

    // 底部提示
    sections.push(
        h('div', { 
            style: { 
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #e8e8e8',
                fontSize: '12px',
                color: '#666'
            } 
        }, [
            h('div', { style: { marginBottom: '4px', fontWeight: 500, color: '#333' } }, '同步说明：'),
            h('div', '• 已关课的课程将被删除'),
            h('div', '• 发生冲突的课程将移至备选课程'),
            h('div', '• 信息变更的课程将自动更新')
        ])
    );

    return sections;
}
