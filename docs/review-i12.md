# I12 DeliveryWorker失败Trace关联（开发记录）

R027修复源码：`b1d30b238b955796a40445f76d37c411c6809bae`；关联D7/D9、A48。独立专项待返回；正式D/A及Live未整体签收。

固定2b5f9e2的独立Native边界差量发现：org delivery获批排队后禁用精确连接，Worker正确进入manual_action_needed且零provider写入，但catch将常量`worker`作为Trace参数传给event，导致delivery_events与audit失去原操作关联。修复仅替换该参数，在lease保护的mutate中读取原delivery.trace_id；审计actor继续为worker，状态表达式、权限／连接／批准、pause和lease fence保持不变。

两项TDD回归先复现再通过：获批连接禁用零出站且event／audit为确认Trace；uncertain写入与随后失败的只读对账均保留确认Trace，POST仅1次、重试为GET，显式reconcile.request审计保留该次请求的独立Trace。连同既有A35/A36/A37/A38、R009、R014相关回归共5/5通过，strict TypeScript通过；没有重复其他14项Native差量、全检或四Ghost。

原独立native-fixture仅抽取D05/D15最小复验，固定b1d30b2通过：实际loopback HTTP的org批准排队、精确连接禁用、manual_action_needed、个人连接仍active但没有fallback；event／audit／delivery确认Trace一致，actor仍worker，providerWriteDelta=0，53次本地HTTP且无handler error。证据为开发树Git忽略的`.runtime/r027-trace/`内probe、red／green、typecheck、native-fixed-sha.log及native-result.json。身份／authority／provider为明确Local fixture，不代表真实NyxID／DEV Live。

R001–R026既有问题已独立有界关闭（R021非门禁），R027等待独立结论。原任务的A04／A07／A19短窗口仍由原任务调度；本任务未操作Docker、root/dev端口或环境，未push。完整角色／入口／时序核算与目标身份／provider／部署、运行责任和生产RPO/RTO保持未签收边界。
