import { Client } from '/Users/onebilion/opt/hypha/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '/Users/onebilion/opt/hypha/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const MCP = '/Users/onebilion/One Billion/当前项目/美食地图/wuhan-food-map/hypha/mcp-server/manyouwei-mcp.cjs';

const transport = new StdioClientTransport({ command: 'node', args: [MCP] });
const client = new Client({ name: 'probe', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOL_COUNT=' + tools.length);
console.log('TOOLS=' + tools.map((t) => t.name).join(','));

const r1 = await client.callTool({
  name: 'discover.filter',
  arguments: { zone: '南湖', mealTime: ['夜宵'], maxPrice: 30 },
});
const t1 = r1.content?.[0]?.text || '';
const j1 = JSON.parse(t1);
console.log('FILTER.success=' + j1.success + ' matched=' + (j1.output?.merchants?.length ?? 0));
console.log('FILTER.sample=' + JSON.stringify((j1.output?.merchants || [])[0] || {}).slice(0, 200));

const r2 = await client.callTool({ name: 'discover.rank', arguments: { board: 'lateNight', limit: 3 } });
const j2 = JSON.parse(r2.content?.[0]?.text || '{}');
console.log('RANK.success=' + j2.success + ' ranked_by=' + j2.output?.ranked_by + ' n=' + (j2.output?.merchants?.length ?? 0));

const r3 = await client.callTool({ name: 'discover.detail', arguments: { merchantId: 'm0100' } });
const j3 = JSON.parse(r3.content?.[0]?.text || '{}');
console.log('DETAIL.success=' + j3.success + ' ' + JSON.stringify(j3.output || {}).slice(0, 160));

await client.close();
console.log('PROBE_OK');
