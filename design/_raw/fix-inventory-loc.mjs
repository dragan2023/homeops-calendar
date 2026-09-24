import fs from 'node:fs';
const p = 'mobile/src/screens/InventoryScreen.tsx';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('loadLocations')) { console.log('已修'); process.exit(0); }

// 用 meta 拿真实地点
s = s.replace(
  '  const [locName, setLocName] = useState<string | null>(null);',
  '  const [locId, setLocId] = useState<string | null>(null);\n  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);'
);
s = s.replace(
  '  useEffect(() => {\n    void load();\n  }, [load]);',
  '  useEffect(() => {\n    void load();\n  }, [load]);\n\n  useEffect(() => {\n    api.meta().then((m) => setLocations(m.locations)).catch(() => undefined);\n  }, []);'
);
// 过滤逻辑
s = s.replace(
  '  const locations = Array.from(new Set(items.map((i) => i.default_location_id).filter(Boolean))) as string[];\n  const sorted = [...items]\n    .filter((i) => (locName ? i.default_location_id === locName : true))',
  '  const sorted = [...items]\n    .filter((i) => (locId ? i.default_location_id === locId : true))'
);
// chips 用真名
s = s.replace(
  '            <Btn label="全部" onPress={() => setLocName(null)} />\n            {locations.map((id) => (\n              <Btn key={id} label={id.slice(0, 4)} onPress={() => setLocName(id)} />\n            ))}',
  '            <Btn label="全部" onPress={() => setLocId(null)} />\n            {locations.map((l) => (\n              <Btn key={l.id} label={l.name} onPress={() => setLocId(l.id)} />\n            ))}'
);
fs.writeFileSync(p, s, 'utf8');
console.log('InventoryScreen: 地点筛选改为真名 + 真过滤');
