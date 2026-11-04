import { configure } from '@testing-library/react';

/**
 * jsdom 在容器裡偶爾會慢過預設的 1 秒（尤其整份測試並行跑的時候），
 * 這時 findBy* 會假紅。放寬等待上限到 3 秒；斷言本身沒有放寬。
 */
configure({ asyncUtilTimeout: 3000 });
