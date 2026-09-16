const NOTICE = {
  type: 'warning',
  title: '服务迁移通知',
  content: `YourTJ选课社区与YourTJ Course APP于2026年9月12日已下线

课程评价与讨论已迁移至新的 YourTJ 论坛（https://f.yourtj.de），迁移详情已在官网 yourtj.de（https://yourtj.de/）公布。新的YourTJ社区APP正在开发中，将在近期推出。

反馈渠道
QQ 群 726096994，欢迎填写使用反馈问卷`,
  enabled: true,
  created_at: '2026-09-16',
}

function buildAnnouncement() {
  return {
    ...NOTICE,
    id: `service-migration-${Date.now()}-${crypto.randomUUID()}`,
  }
}

export default async (request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        Allow: 'GET, OPTIONS',
      },
    })
  }

  const announcement = buildAnnouncement()
  const pathname = new URL(request.url).pathname
  const payload = pathname.endsWith('/announcements')
    ? { announcements: [announcement] }
    : {
        maintenance: {
          enabled: true,
          config: {
            title: 'YourTJ Course App已下线',
            message: NOTICE.content,
          },
        },
        announcements: [announcement],
        updatedAt: Date.now(),
      }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
