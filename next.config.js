/** @type {import('next').NextConfig} */
const nextConfig = {
    // ... 你原本的其他設定 (如果有的話)
    
    // 👇 加入這段
    eslint: {
      // 警告：這允許你在有 ESLint 錯誤的情況下也能完成構建
      ignoreDuringBuilds: true,
    },
    typescript: {
      // 如果你有 TypeScript 錯誤也想忽略，可以加這個
      ignoreBuildErrors: true, 
    },
  };
  
  export default nextConfig;