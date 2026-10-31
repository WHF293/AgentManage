// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 无头模式：agenthub.exe --migrate [--link-mode symlink|junction|copy]
    // 不启 GUI，直接执行 M1 迁移并打印 JSON 报告（用于验收 / 冒烟）
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--migrate") {
        let mode = args
            .iter()
            .position(|a| a == "--link-mode")
            .and_then(|i| args.get(i + 1))
            .map(String::as_str);
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        match agenthub_lib::migrate::migrate_skills(&store, mode) {
            Ok(report) => {
                println!("{}", serde_json::to_string_pretty(&report).expect("serialize"));
            }
            Err(e) => {
                eprintln!("迁移失败: {e}");
                std::process::exit(1);
            }
        }
        return;
    }
    // 无头模式：agenthub.exe --sync-mcp [--adopt]  收编（可选）→ 全量同步双端
    if args.iter().any(|a| a == "--sync-mcp") {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        if args.iter().any(|a| a == "--adopt") {
            let n = agenthub_lib::mcp::adopt_from_targets(&store, false).expect("adopt 失败");
            println!("收编 {n} 个 server");
        }
        match agenthub_lib::mcp::sync_all(&store) {
            Ok((wb, zc)) => println!("{wb}\n{zc}"),
            Err(e) => {
                eprintln!("MCP 同步失败: {e}");
                std::process::exit(1);
            }
        }
        return;
    }
    // 无头模式：agenthub.exe --fetch-models <provider-id>  验证 /v1/models 候选链
    if let Some(pid) = args
        .iter()
        .position(|a| a == "--fetch-models")
        .and_then(|i| args.get(i + 1))
    {
        let provs = agenthub_lib::providers::read_zcode_providers().expect("读 provider 失败");
        let p = provs
            .iter()
            .find(|p| p.id == *pid)
            .unwrap_or_else(|| panic!("provider 不存在：{pid}"));
        let key = agenthub_lib::providers::resolve_api_key(pid, None).expect("key 缺失");
        let r = agenthub_lib::modelfetch::fetch_models(&p.kind, &p.base_url, &key, None);
        println!(
            "{}",
            serde_json::to_string_pretty(&r).expect("serialize")
        );
        return;
    }
    // 无头模式：agenthub.exe --wb-status  账号岛状态探测（含槽位/进程/当前 uid）
    if args.iter().any(|a| a == "--wb-status") {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        let o = agenthub_lib::account::overview(&store).expect("wb overview 失败");
        println!(
            "{}",
            serde_json::to_string_pretty(&o).expect("serialize")
        );
        return;
    }
    // 无头模式：agenthub.exe --wb-save-slot <label>（仅快照复制，不切换不启动）
    if let Some(label) = args
        .iter()
        .position(|a| a == "--wb-save-slot")
        .and_then(|i| args.get(i + 1))
    {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        let slot = agenthub_lib::account::save_slot(&store, label).expect("保存槽位失败");
        println!(
            "{}",
            serde_json::to_string_pretty(&slot).expect("serialize")
        );
        return;
    }
    // 无头模式：agenthub.exe --usage-collect [range]  采集双源 + 打印聚合概览
    if args.iter().any(|a| a == "--usage-collect") {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        let (z, w) = agenthub_lib::usage::collect_all(&store, None).expect("采集失败");
        println!("新增事件 zcode={z} workbuddy={w}");
        let range = args.get(args.len() - 1).map(String::as_str).unwrap_or("day");
        let o = agenthub_lib::usage::overview(&store, range).expect("聚合失败");
        println!(
            "{}",
            serde_json::to_string_pretty(&o).expect("serialize")
        );
        return;
    }
    // 无头模式：agenthub.exe --market-refresh  刷新全部内置市场目录
    if args.iter().any(|a| a == "--market-refresh") {
        let catalog = agenthub_lib::market::refresh_all();
        for w in &catalog.warnings {
            println!("⚠ {w}");
        }
        for s in &catalog.skills {
            println!(
                "{:16} [{:14}] [{}] {}",
                s.name,
                s.source_name,
                if s.installed { "已装" } else { "未装" },
                s.description.chars().take(52).collect::<String>()
            );
        }
        println!("共 {} 个市场技能", catalog.skills.len());
        return;
    }
    // 无头模式：agenthub.exe --bridge-test <项目路径>  M6 桥接全链路：init → sync → consolidate
    if let Some(path) = args
        .iter()
        .position(|a| a == "--bridge-test")
        .and_then(|i| args.get(i + 1))
    {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        let overview = agenthub_lib::memory::overview_projects(&store).expect("项目注册失败");
        println!(
            "已知项目 {} 个；{}",
            overview.len(),
            overview
                .iter()
                .map(|p| format!("{}(.ai={})", p.name, p.ai_ready))
                .collect::<Vec<_>>()
                .join(", ")
        );
        println!("── init ──");
        for s in agenthub_lib::memory::init_project_bridge(&store, path).expect("init 失败") {
            println!("  {s}");
        }
        println!("── sync ──");
        for s in agenthub_lib::memory::sync_project_bridge(&store, path).expect("sync 失败") {
            println!("  {s}");
        }
        println!("── consolidate ──");
        for s in agenthub_lib::memory::consolidate_project_bridge(&store, path).expect("蒸馏失败") {
            println!("  {s}");
        }
        return;
    }
    // 无头模式：agenthub.exe --unify-memory  全局记忆统一：真身 ~/.agenthub/MEMORY.md + 双端建链
    if args.iter().any(|a| a == "--unify-memory") {
        let store = agenthub_lib::store::Store::open().expect("初始化 ~/.agenthub 失败");
        match agenthub_lib::memory::unify_global_memory(&store) {
            Ok(steps) => {
                for s in steps {
                    println!("{s}");
                }
            }
            Err(e) => {
                eprintln!("统一失败: {e}");
                std::process::exit(1);
            }
        }
        return;
    }
    agenthub_lib::run()
}
