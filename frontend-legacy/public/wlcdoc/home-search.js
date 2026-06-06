// 首页自定义搜索框脚本
(function() {
  window.addEventListener('DOMContentLoaded', function() {
    // 等待 VitePress 搜索按钮加载
    const checkSearchButton = setInterval(() => {
      const searchButton = document.querySelector('.DocSearch-Button, .VPNavSearch .search-box');
      if (searchButton) {
        clearInterval(checkSearchButton);

        // 创建首页大搜索框
        const heroSection = document.querySelector('.VPHero');
        if (heroSection) {
          const heroContent = heroSection.querySelector('.container');
          if (heroContent) {
            // 创建搜索按钮容器
            const searchContainer = document.createElement('div');
            searchContainer.className = 'hero-search-box';
            searchContainer.innerHTML = `
              <button class="hero-search-button" onclick="document.querySelector('.DocSearch-Button')?.click()">
                <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>搜索课程或教师</span>
                <kbd>Ctrl K</kbd>
              </button>
            `;

            // 将搜索框插入到 hero 标题右边
            const title = heroContent.querySelector('h1');
            if (title) {
              title.parentNode.style.display = 'flex';
              title.parentNode.style.alignItems = 'center';
              title.parentNode.style.justifyContent = 'space-between';
              title.parentNode.style.gap = '2rem';
              title.parentNode.insertBefore(searchContainer, title.nextSibling);
            }
          }
        }
      }
    }, 100);

    // 10秒后停止检查
    setTimeout(() => clearInterval(checkSearchButton), 10000);
  });
})();
