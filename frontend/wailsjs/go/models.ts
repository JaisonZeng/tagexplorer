export namespace api {
	
	export class CustomFormat {
	    prefix: string;
	    suffix: string;
	    separator: string;
	
	    static createFrom(source: any = {}) {
	        return new CustomFormat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.prefix = source["prefix"];
	        this.suffix = source["suffix"];
	        this.separator = source["separator"];
	    }
	}
	export class TagRuleConfig {
	    format: string;
	    customFormat?: CustomFormat;
	    position: string;
	    addSpaces: boolean;
	    grouping: string;
	
	    static createFrom(source: any = {}) {
	        return new TagRuleConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.format = source["format"];
	        this.customFormat = this.convertValues(source["customFormat"], CustomFormat);
	        this.position = source["position"];
	        this.addSpaces = source["addSpaces"];
	        this.grouping = source["grouping"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppSettings {
	    tagRule: TagRuleConfig;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tagRule = this.convertValues(source["tagRule"], TagRuleConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Tag {
	    id: number;
	    name: string;
	    color: string;
	    parent_id?: number;
	
	    static createFrom(source: any = {}) {
	        return new Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.parent_id = source["parent_id"];
	    }
	}
	export class FileRecord {
	    id: number;
	    workspace_id: number;
	    path: string;
	    name: string;
	    size: number;
	    type: string;
	    mod_time: string;
	    created_at: string;
	    hash: string;
	    tags: Tag[];
	
	    static createFrom(source: any = {}) {
	        return new FileRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.workspace_id = source["workspace_id"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.type = source["type"];
	        this.mod_time = source["mod_time"];
	        this.created_at = source["created_at"];
	        this.hash = source["hash"];
	        this.tags = this.convertValues(source["tags"], Tag);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FilePage {
	    total: number;
	    records: FileRecord[];
	
	    static createFrom(source: any = {}) {
	        return new FilePage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.records = this.convertValues(source["records"], FileRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class FileSearchParams {
	    tag_ids: number[];
	    folder_path: string;
	    include_subfolders: boolean;
	    limit: number;
	    offset: number;
	
	    static createFrom(source: any = {}) {
	        return new FileSearchParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tag_ids = source["tag_ids"];
	        this.folder_path = source["folder_path"];
	        this.include_subfolders = source["include_subfolders"];
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	    }
	}
	export class OrganizeLevel {
	    tag_ids: number[];
	
	    static createFrom(source: any = {}) {
	        return new OrganizeLevel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tag_ids = source["tag_ids"];
	    }
	}
	export class OrganizeSummary {
	    total: number;
	    move_count: number;
	    conflict_count: number;
	    skip_count: number;
	    already_in_place: number;
	
	    static createFrom(source: any = {}) {
	        return new OrganizeSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.move_count = source["move_count"];
	        this.conflict_count = source["conflict_count"];
	        this.skip_count = source["skip_count"];
	        this.already_in_place = source["already_in_place"];
	    }
	}
	export class OrganizePreviewItem {
	    file_id: number;
	    original_path: string;
	    target_path: string;
	    status: string;
	    missing_tags?: string[];
	    tags?: string[];
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new OrganizePreviewItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file_id = source["file_id"];
	        this.original_path = source["original_path"];
	        this.target_path = source["target_path"];
	        this.status = source["status"];
	        this.missing_tags = source["missing_tags"];
	        this.tags = source["tags"];
	        this.message = source["message"];
	    }
	}
	export class OrganizePreview {
	    items: OrganizePreviewItem[];
	    summary: OrganizeSummary;
	    base_path: string;
	
	    static createFrom(source: any = {}) {
	        return new OrganizePreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], OrganizePreviewItem);
	        this.summary = this.convertValues(source["summary"], OrganizeSummary);
	        this.base_path = source["base_path"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class OrganizeRequest {
	    levels: OrganizeLevel[];
	
	    static createFrom(source: any = {}) {
	        return new OrganizeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.levels = this.convertValues(source["levels"], OrganizeLevel);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OrganizeResult {
	    preview: OrganizePreview;
	    operation_id: number;
	
	    static createFrom(source: any = {}) {
	        return new OrganizeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.preview = this.convertValues(source["preview"], OrganizePreview);
	        this.operation_id = source["operation_id"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class OrganizeUndoResult {
	    restored: number;
	    failed: number;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new OrganizeUndoResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.restored = source["restored"];
	        this.failed = source["failed"];
	        this.message = source["message"];
	    }
	}
	export class Workspace {
	    id: number;
	    path: string;
	    name: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.created_at = source["created_at"];
	    }
	}
	export class ScanResult {
	    workspace: Workspace;
	    file_count: number;
	    directory_count: number;
	
	    static createFrom(source: any = {}) {
	        return new ScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspace = this.convertValues(source["workspace"], Workspace);
	        this.file_count = source["file_count"];
	        this.directory_count = source["directory_count"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace main {
	
	export class RecentItem {
	    id: number;
	    type: string;
	    path: string;
	    name: string;
	    opened_at: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.opened_at = source["opened_at"];
	    }
	}
	export class WorkspaceConfig {
	    name: string;
	    folders: string[];
	    // Go type: time
	    created_at: any;
	    version: string;
	    file_path?: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.folders = source["folders"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.version = source["version"];
	        this.file_path = source["file_path"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

