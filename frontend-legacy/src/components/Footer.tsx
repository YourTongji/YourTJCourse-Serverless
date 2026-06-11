import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-2 md:mt-16 border-t border-slate-200 bg-white/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4">
          {/* 导航链接 */}
          <div className="flex gap-6 text-sm">
            <Link
              to="/about"
              className="text-slate-600 hover:text-cyan-600 transition-colors"
            >
              关于
            </Link>
            <Link
              to="/faq"
              className="text-slate-600 hover:text-cyan-600 transition-colors"
            >
              常见问题
            </Link>
          </div>

          {/* 版权信息 */}
          <div className="text-xs text-slate-400">
            © {currentYear} YOURTJ选课社区
          </div>
        </div>
      </div>
    </footer>
  )
}
