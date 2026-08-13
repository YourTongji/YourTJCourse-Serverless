// 课程同步UI渲染工具
import { h } from 'vue';
import type { VNode } from 'vue';
import type { CourseChangeInfo } from './myInterface';
import { CourseChangeType } from './myInterface';

interface ChangeSectionOptions {
    // details 文本是否需要保留换行（冲突分组的 details 含多行）
    preLineDetails?: boolean;
    // 自定义 details 行文本；返回 null 则不渲染该行。缺省为 c.details || null
    formatDetails?: (c: CourseChangeInfo) => string | null;
    // 卡片内的附加行（如冲突对象提示）
    renderExtra?: (c: CourseChangeInfo) => VNode | null;
}

const cardStyle = {
    padding: '8px 12px',
    marginBottom: '6px',
    marginLeft: '12px',
    border: '1px solid #f0f0f0',
    borderRadius: '4px',
    backgroundColor: '#fafafa'
};

/**
 * 渲染一组同类课程变更（标题 + 卡片列表）
 * @param title 分组标题
 * @param color 标题方块颜色
 * @param courses 该分组的变更列表
 * @param options 见 ChangeSectionOptions
 * @returns VNode；courses 为空时返回 null
 */
function renderChangeSection(
    title: string,
    color: string,
    courses: CourseChangeInfo[],
    options?: ChangeSectionOptions
): VNode | null {
    if (courses.length === 0) return null;

    const { preLineDetails = false, formatDetails, renderExtra } = options || {};
    const detailStyle: Record<string, string> = {
        fontSize: '12px',
        color: '#666',
        marginTop: '4px'
    };
    if (preLineDetails) detailStyle.whiteSpace = 'pre-line';

    return h('div', { style: { marginBottom: '16px' } }, [
        h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' } }, [
            h('span', { style: { color } }, '■ '),
            `${title} (${courses.length}门)`
        ]),
        ...courses.map(c => {
            const detailText = formatDetails ? formatDetails(c) : (c.details || null);
            return h('div', { style: cardStyle }, [
                h('div', { style: { fontSize: '13px', fontWeight: 500 } }, c.courseName),
                detailText ? h('div', { style: detailStyle }, detailText) : null,
                renderExtra ? renderExtra(c) : null
            ]);
        })
    ]);
}

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

    const sections = [
        renderChangeSection('已关课', '#ff4d4f', closedCourses),
        renderChangeSection('所选班级已关闭', '#fa8c16', classClosedCourses, {
            formatDetails: (c) => `${c.details || '所选班级已关闭'}，课程已保留为未选状态，请重新选择班级`
        }),
        renderChangeSection('更新后发生冲突', '#fa8c16', conflictCourses, {
            preLineDetails: true,
            renderExtra: (c) => c.conflictWith && !c.details?.includes('与同样变更的课程')
                ? h('div', {
                    style: {
                        fontSize: '12px',
                        color: '#fa8c16',
                        marginTop: '4px'
                    }
                }, `→ 与 ${c.conflictWith} 冲突`)
                : null
        }),
        renderChangeSection('信息已变更', '#1890ff', changedCourses)
    ].filter((s): s is VNode => s !== null);

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
            h('div', '• 所选班级已关闭的课程将保留为未选状态'),
            h('div', '• 发生冲突的课程将移至备选课程'),
            h('div', '• 信息变更的课程将自动更新')
        ])
    );

    return sections;
}
