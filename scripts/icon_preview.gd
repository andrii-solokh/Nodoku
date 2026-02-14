extends Control

const GRID_SIZE := 2
const GRID_DEPTH := 2
const IDEA_COUNT := 24
const STYLE_COUNT := 2

var _grid_view: GridView
var _idea_index: int = 0
var _style_index: int = 0
var _current_model: GridModel
var _current_recipe: Dictionary = {}

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)
	_grid_view = GridView.new()
	add_child(_grid_view)
	_grid_view.float_amp_factor = 0.0
	_grid_view.float_speed = 0.0
	_idea_index = _read_idea_from_url()
	_style_index = _read_style_from_url()
	_apply_idea(_idea_index)

func _draw() -> void:
	if _grid_view == null or _current_model == null or _current_recipe.is_empty():
		return
	if _style_index == 1:
		_draw_style_two_bg()

func _draw_style_two_bg() -> void:
	var c := size * 0.5 + Vector2(-size.x * 0.06, -size.y * 0.05)
	for i in range(9, 0, -1):
		var t := float(i) / 9.0
		var glow := Color("#ECE6DD")
		glow.a = 0.11 * t
		draw_circle(c, min(size.x, size.y) * 0.10 * (10 - i), glow)

func _apply_idea(index: int) -> void:
	var model := GridModel.new(GRID_SIZE, GRID_SIZE, GRID_DEPTH)
	model.set_surface_only(true)
	for i in range(model.required.size()):
		model.required[i] = 0

	var recipe := _idea_recipe(index)
	var placed_pairs := _pairs_from_chains(recipe["placed_chains"])
	var ghost_pairs := _pairs_from_chains(recipe["ghost_chains"])

	model.solution_edges.clear()
	model.placed_edges.clear()
	_apply_edge_pairs(model, placed_pairs, model.solution_edges, true)
	_apply_edge_pairs(model, ghost_pairs, model.solution_edges, true)
	_apply_edge_pairs(model, placed_pairs, model.placed_edges, false)

	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		model.required[node_id] = model.placed_degree(node_id)

	var remaining_overrides: Array = recipe.get("remaining_overrides", [])
	for item in remaining_overrides:
		if item.size() != 2:
			continue
		var v: Vector3i = item[0]
		var remaining: int = maxi(0, int(item[1]))
		if not model.in_bounds(v.x, v.y, v.z):
			continue
		var node_id := _id_from_vec3i(model, v)
		if not model.is_active(node_id):
			continue
		model.required[node_id] = model.placed_degree(node_id) + remaining

	_grid_view.position = Vector2.ZERO
	_grid_view.model = model
	_apply_style_palette()
	_grid_view.force_unsolved_white_fill = bool(recipe.get("unsolved_white_fill", false))
	_grid_view.rotation_basis = _rotation_basis(float(recipe["yaw"]), float(recipe["pitch"]))
	_grid_view.selected_id = _id_from_vec3i(model, recipe["selected_node"])
	_grid_view.hint_id = _id_from_vec3i(model, recipe["hint_node"])

	if bool(recipe.get("center_on_selected", false)):
		_center_view_on_selected(_grid_view.selected_id)
	if bool(recipe.get("hide_selection", false)):
		_grid_view.selected_id = -1
		_grid_view.hint_id = -1
	_grid_view.queue_redraw()

	_current_model = model
	_current_recipe = recipe
	queue_redraw()

func _apply_style_palette() -> void:
	_grid_view.reset_style_palette()
	if _style_index == 1:
		_grid_view.set_style_palette({
			"bg": Color("#EFE6D8"),
			"circle": Color("#2F4A56"),
			"dot": Color("#1A2D36"),
			"edge": Color("#2D4652"),
			"selected": Color("#CF9329"),
			"quiet": Color("#F8F2E9"),
		})

func _pairs_from_chains(chains: Array) -> Array:
	var out: Array = []
	for chain in chains:
		if chain.size() < 2:
			continue
		for i in range(chain.size() - 1):
			out.append([chain[i], chain[i + 1]])
	return out

func _apply_edge_pairs(model: GridModel, pairs: Array, target: Dictionary, count_required: bool) -> void:
	for pair in pairs:
		if pair.size() != 2:
			continue
		var a: Vector3i = pair[0]
		var b: Vector3i = pair[1]
		if not model.in_bounds(a.x, a.y, a.z) or not model.in_bounds(b.x, b.y, b.z):
			continue
		var id_a := _id_from_vec3i(model, a)
		var id_b := _id_from_vec3i(model, b)
		if not model.is_active(id_a) or not model.is_active(id_b):
			continue
		if not model.is_neighbor(id_a, id_b):
			continue
		var key := model.edge_key(id_a, id_b)
		if target.has(key):
			continue
		target[key] = true
		if count_required:
			model.required[id_a] += 1
			model.required[id_b] += 1

func _center_view_on_selected(selected_id: int) -> void:
	if selected_id < 0:
		return
	var nodes: Array = _grid_view.call("_compute_nodes")
	if nodes.is_empty():
		return
	var vp_center := get_viewport_rect().size * 0.5
	for n in nodes:
		if int(n.id) != selected_id:
			continue
		_grid_view.position = vp_center - Vector2(n.pos)
		return

func _id_from_vec3i(model: GridModel, v: Vector3i) -> int:
	return model.id(v.x, v.y, v.z)

func _rotation_basis(yaw: float, pitch: float) -> Basis:
	var basis := Basis()
	basis = Basis(Vector3.UP, yaw) * basis
	basis = Basis(Vector3.RIGHT, pitch) * basis
	return basis.orthonormalized()

func _n(x: int, y: int, z: int) -> Vector3i:
	return Vector3i(x, y, z)

func _r(yaw: float, pitch: float, selected: Vector3i, hint: Vector3i, placed_chains: Array, ghost_chains: Array, remaining_overrides: Array = [], center_on_selected: bool = false, hide_selection: bool = false, unsolved_white_fill: bool = false) -> Dictionary:
	return {
		"yaw": yaw,
		"pitch": pitch,
		"selected_node": selected,
		"hint_node": hint,
		"placed_chains": placed_chains,
		"ghost_chains": ghost_chains,
		"remaining_overrides": remaining_overrides,
		"center_on_selected": center_on_selected,
		"hide_selection": hide_selection,
		"unsolved_white_fill": unsolved_white_fill,
	}

func _idea_recipe(index: int) -> Dictionary:
	if index == 8:
		return _r(
			-PI / 4.0,
			-atan(1.0 / sqrt(2.0)),
			_n(0, 0, 1),
			_n(0, 0, 0),
			[
				[_n(0, 0, 1), _n(0, 0, 0)],
				[_n(0, 0, 1), _n(1, 0, 1)],
				[_n(0, 0, 1), _n(0, 1, 1)]
			],
			[],
			[[_n(1, 1, 0), 3], [_n(0, 0, 0), 1], [_n(1, 0, 1), 1], [_n(0, 1, 1), 1]],
			true,
			true,
			true
		)
	return _idea_recipe(8)

func _read_idea_from_url() -> int:
	if not OS.has_feature("web"):
		return 8
	if not Engine.has_singleton("JavaScriptBridge"):
		return 8
	var js := Engine.get_singleton("JavaScriptBridge")
	if js == null:
		return 8
	var search := String(js.call("eval", "window.location.search", true))
	if search == "":
		return 8
	var query := search.trim_prefix("?").split("&", false)
	for token in query:
		var kv := token.split("=", true, 1)
		if kv.size() != 2:
			continue
		if kv[0] != "icon_idea" and kv[0] != "icon_variant":
			continue
		if kv[1].is_valid_int():
			return clampi(int(kv[1]), 0, IDEA_COUNT - 1)
	return 8

func _read_style_from_url() -> int:
	if not OS.has_feature("web"):
		return 1
	if not Engine.has_singleton("JavaScriptBridge"):
		return 1
	var js := Engine.get_singleton("JavaScriptBridge")
	if js == null:
		return 1
	var search := String(js.call("eval", "window.location.search", true))
	if search == "":
		return 1
	var query := search.trim_prefix("?").split("&", false)
	for token in query:
		var kv := token.split("=", true, 1)
		if kv.size() != 2:
			continue
		if kv[0] != "icon_style":
			continue
		if kv[1].is_valid_int():
			return clampi(int(kv[1]), 0, STYLE_COUNT - 1)
	return 1
