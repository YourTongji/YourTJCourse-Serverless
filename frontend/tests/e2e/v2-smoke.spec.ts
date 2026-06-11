import { expect, test, type Page } from "@playwright/test";

const runtimeState = {
  maintenance: false,
  maintenanceMessage: "",
  announcements: [],
};

const courseRows = [
  {
    id: 101,
    code: "100001",
    name: "高等数学A",
    rating: 4.6,
    review_count: 18,
    is_legacy: 0,
    teacher_name: "张三",
    department: "数学科学学院",
    credit: 5,
    semesters: ["2025-2026 学年第一学期"],
  },
  {
    id: 102,
    code: "200002",
    name: "程序设计基础",
    rating: 4.2,
    review_count: 9,
    is_legacy: 0,
    teacher_name: "李四",
    department: "软件学院",
    credit: 3,
    semesters: ["2025-2026 学年第一学期"],
  },
];

const schedulerCourse = {
  courseName: "高等数学A",
  courseCode: "100001",
  courseType: "专业基础课",
  credit: 5,
  grade: 2024,
  faculty: "数学科学学院",
  courseDetail: [],
};

const classDetails = [
  {
    code: "10000101",
    campus: "四平路校区",
    teachers: [{ teacherCode: "T001", teacherName: "张三" }],
    teachingLanguage: "中文",
    status: 0,
    arrangementInfo: [
      {
        arrangementText: "周一 1-2节 1-16周 教学楼A101",
        occupyDay: 1,
        occupyTime: [1, 2],
        occupyWeek: Array.from({ length: 16 }, (_, index) => index + 1),
        occupyRoom: "教学楼A101",
        teacherAndCode: "张三(T001)",
      },
    ],
  },
];

async function mockApi(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/settings/runtime") {
      return route.fulfill({ json: runtimeState });
    }
    if (path === "/api/settings/announcements") {
      return route.fulfill({ json: { announcements: [] } });
    }
    if (path === "/api/departments") {
      return route.fulfill({
        json: { departments: ["数学科学学院", "软件学院"] },
      });
    }
    if (path === "/api/courses") {
      return route.fulfill({
        json: {
          data: courseRows,
          page: Number(url.searchParams.get("page") || "1"),
          limit: 20,
          hasMore: false,
          total: courseRows.length,
          totalPages: 1,
        },
      });
    }
    if (path === "/api/getAllCalendar") {
      return route.fulfill({
        json: {
          code: 0,
          msg: "ok",
          data: [{ calendarId: 120, calendarName: "2025-2026 学年第一学期" }],
        },
      });
    }
    if (path === "/api/findGradeByCalendarId") {
      return route.fulfill({ json: { code: 0, msg: "ok", data: { gradeList: [2024] } } });
    }
    if (path === "/api/findMajorByGrade") {
      return route.fulfill({
        json: { code: 0, msg: "ok", data: [{ code: "CS", name: "计算机科学与技术" }] },
      });
    }
    if (path === "/api/findCourseByMajor") {
      return route.fulfill({ json: { code: 0, msg: "ok", data: [schedulerCourse] } });
    }
    if (path === "/api/findOptionalCourseType") {
      return route.fulfill({
        json: {
          code: 0,
          msg: "ok",
          data: [{ courseLabelId: 10, courseLabelName: "通识选修课" }],
        },
      });
    }
    if (path === "/api/findCourseByNatureId") {
      return route.fulfill({
        json: {
          code: 0,
          msg: "ok",
          data: [
            {
              courseLabelId: 10,
              courseLabelIds: [10],
              courseLabelName: "通识选修课",
              courses: [
                {
                  courseName: "城市与文化",
                  courseCode: "300003",
                  credit: 2,
                  faculty: "人文学院",
                },
              ],
            },
          ],
        },
      });
    }
    if (path === "/api/findCourseBySearch") {
      return route.fulfill({
        json: {
          code: 0,
          msg: "ok",
          data: { courses: [schedulerCourse], sizeLimit: 100 },
        },
      });
    }
    if (path === "/api/findCourseDetailByCode") {
      return route.fulfill({
        json: { code: 0, msg: "ok", data: { "100001": classDetails } },
      });
    }
    if (path === "/api/findCourseByTime") {
      return route.fulfill({
        json: { code: 0, msg: "ok", data: [schedulerCourse] },
      });
    }
    if (path === "/api/getAllCampus") {
      return route.fulfill({
        json: { code: 0, msg: "ok", data: [{ campusId: "1", campusName: "四平路校区" }] },
      });
    }
    if (path === "/api/getAllFaculty") {
      return route.fulfill({
        json: { code: 0, msg: "ok", data: [{ facultyId: "1", facultyName: "数学科学学院" }] },
      });
    }
    if (path === "/api/getLatestUpdateTime") {
      return route.fulfill({ json: { code: 0, msg: "ok", data: "2026-06-10" } });
    }
    if (path === "/api/course/by-code/100001") {
      return route.fulfill({
        json: {
          reviews: [
            {
              id: 1,
              rating: 5,
              reviewer_name: "匿名同学",
              comment: "讲解清楚，作业量适中。",
              created_at: "2026-06-01T00:00:00.000Z",
            },
          ],
        },
      });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${path}` } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("v2 frontend core flows render and remain interactive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /查课程评价/ })).toBeVisible();
  await page.getByPlaceholder("课程名、课号或教师").fill("高等数学");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page).toHaveURL(/\/courses\?q=/);

  await expect(page.getByRole("heading", { name: "课程目录" })).toBeVisible();
  await expect(page.getByText("高等数学A").first()).toBeVisible();
  await expect(page.getByText("张三").first()).toBeVisible();

  await page.getByRole("link", { name: "排课模拟" }).click();
  await expect(page.getByRole("heading", { name: "排课模拟" })).toBeVisible();

  await page.locator("select").nth(0).selectOption("120");
  await page.locator("select").nth(1).selectOption("2024");
  await page.locator("select").nth(2).selectOption("CS");
  await expect(page.getByText("已是最新")).toBeVisible();

  await page.getByRole("button", { name: /选择课程/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByText("高等数学A").click();
  await page.getByRole("button", { name: /提交 \(1\)/ }).click();
  await expect(page.getByText("总学分：5.0")).toBeVisible();
  const stagedCourseButton = page.getByRole("button", {
    name: "高等数学A",
    exact: true,
  });
  await expect(stagedCourseButton).toBeVisible();

  await stagedCourseButton.click();
  await expect(page.getByText("10000101")).toBeVisible();
  await page.getByText("10000101").click();
  await expect(page.getByText("已选课").first()).toBeVisible();

  await page.getByRole("button", { name: "查看评价" }).click();
  await expect(page.getByText("讲解清楚，作业量适中。")).toBeVisible();

  await page.keyboard.press("Escape");
  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "反馈留言板" })).toBeVisible();
  await expect(page.getByText(/反馈服务暂未配置/)).toBeVisible();
});
