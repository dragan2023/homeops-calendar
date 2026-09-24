import fs from 'node:fs';
const p = 'mobile/src/__tests__/screens.test.tsx';
let s = fs.readFileSync(p, 'utf8');
// LoginScreen 里用了 useAuth()，必须包一层 AuthProvider（否则抛"必须在 AuthProvider 内使用"）
s = s.replace('const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);',
  'const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);\n// eslint-disable-next-line @typescript-eslint/no-var-requires\nconst { AuthProvider } = require("../contexts/AuthContext") as { AuthProvider: React.ComponentType<{ children: React.ReactNode }> };\nconst wrapAuth = (ui: React.ReactElement) => render(<ThemeProvider><AuthProvider>{ui}</AuthProvider></ThemeProvider>);');
s = s.split('    wrap(<LoginScreen />);').join('    wrapAuth(<LoginScreen />);');
fs.writeFileSync(p, s, 'utf8');
console.log('登录用例：已包 AuthProvider');
