# 当前3457注册更新与受控回滚

本轮已在 `386b9652dc431bb83e4864d5b046b378110ee88d` 的r2容器健康读回后完成共享catalog更新。更新前已与完整私有preimage逐字段相等，原spec URL与description均为null、active endpoint为0；更新后正式Admin `discover-endpoints {}` 从当前3457抓取并解析OpenAPI，完整35项schema与独立注册证据一致。

本包的 `report.json`、`service-field-diff.json`、`endpoints-before.json`、`endpoints-after.json`、`discovery.json` 和 `openapi.json` 可直接复核；完整catalog pre/postimage包含在私有交接中，公开报告记录其hash。仅spec URL、description、兼容alias及updated_at改变。现有identity、audience、delegation、trust、主页、UserService与批准策略没有修改；共享注册与operator保持可用。

以下为需要root另行决定时的回滚准备，**没有执行回滚**：

1. 保持当前用户服务可用，先按既有运行维护方案排空相关写命令。以同一有权限且active的operator，通过官方GET读回catalog和本轮35个endpoint ID；若与本轮postimage的有效契约出现漂移，停止并复核，不覆盖后续人的变更。
2. 通过 `PUT /api/v1/services/{catalog-id}` 清除spec URL：`{"openapi_spec_url":"","description":""}`。同时空description可满足049的至少一个可更新字段要求。保留base_url、主页和所有identity/trust字段。
3. **原description为null，当前049的 `Option<String>` 更新API将JSON null当作未提供，不能原样恢复null。** 上述操作恢复为空描述字符串，存在 `null → ""` 的元数据差异，必须在回滚结果中明确记录。不要以直接数据库写入掩盖差异，也不声称字节或全字段完全回退。
4. 如需恢复原“无active durable endpoints”的发现状态，只对 `report.json.createdEndpointIds` 列出的本轮35个ID执行官方 `PUT /api/v1/services/{catalog-id}/endpoints/{endpoint-id}`，body `{"is_active":false}`。不批量删除其它操作，不清库，不修改UserService，保留inactive操作及审核历史。逐条读回、记录HTTP结果；最终GET active endpoints应为空。
5. generation、更新时间及审核记录保留前进。不得回滚generation或复活旧批准/旧key/旧blocked命令；重新启用契约时再走正式发现并获得新的必要授权。现有proxy/CMS业务路径的回归与公开spec可达性应另行检查，不能仅以active目录0作为整个系统回滚成功。

私有snapshot用于比对和审计，不是可以直接覆盖运行数据库的恢复包。生产部署、外部provider及所有transport验收不属于本次本地注册更新。
