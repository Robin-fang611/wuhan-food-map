// Hypha 运行时溯源常量：所有推荐均溯源至 DomainPack 编译指纹（确定性）。
//
// processHash 由 activate.cjs（@hypha/domain 离线编译）产出，是 DomainPack 的确定性指纹。
// 2026-08-10 复核：扩展 output.summary 契约（补 degradation/guidance/provenance）后重新编译，
// processHash 保持不变（sha256:afbfbab2…），证明指纹对本次「仅微调」稳定，下游引用无需更新。
export const PROCESS_HASH = 'sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5';
export const DOMAIN_ID = 'domain.manyouwei-food-discovery';
export const DOMAIN_VERSION = '0.1.0';

// 本地确定性编排器实际走过的 FSM 路径（对齐 domain.yaml workflow.food-discovery）。
export const FSM_PATH = ['Intake', 'Discover', 'Completed'];

// 本产品实际装配的 4 个 prompt.food.*（对应 domain.yaml allowedPromptRefs，文件见 ../prompts）。
export const PROMPT_REFS = ['intake', 'discover', 'detail', 'reward'];
