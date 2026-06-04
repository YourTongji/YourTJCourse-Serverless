// 时间表上的 helper funtion

export function getRowSection(row: number, calendarId: number = 0): number {
    // calendarId >= 120 为 2025-2026学年第1学期及以后，使用新的11节课制
    if (calendarId >= 120) {
        switch (row) {
            case 1:
            case 2:
                return 1;
            case 3:
            case 4:
                return 2;
            case 5:
            case 6:
                return 3;
            case 7:
            case 8:
                return 4;
            case 9:
            case 10:
                return 5;
            case 11:
                return 6;
            default:
                return -1;
        }
    } else {
        switch (row) {
            case 1:
            case 2:
                return 1;
            case 3:
            case 4:
                return 2;
            case 5:
            case 6:
                return 3;
            case 7:
            case 8:
                return 4;
            case 9:
                return 5;
            case 10:
            case 11:
            case 12:
                return 6;
            default:
                return -1;
        }
    }
}
