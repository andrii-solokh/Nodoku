class_name GridView
extends Node2D

const FACE_FRONT := 0
const FACE_BACK := 1
const FACE_LEFT := 2
const FACE_RIGHT := 3
const FACE_TOP := 4
const FACE_BOTTOM := 5

const COLOR_BG := Color("#F4F1EC")
const COLOR_CIRCLE := Color("#4A5A5E")
const COLOR_DOT := Color("#2F3E46")
const COLOR_EDGE := Color("#4A5A5E")
const COLOR_SELECTED := Color("#C1A66A")
const COLOR_QUIET := Color("#DAD4CC")

const FADE_BACK := 0.05
const FADE_FRONT := 1.0
const PICK_FADE_MIN := 0.45
const PICK_BLUR_MAX := 0.5
const DEPTH_BLUR_STEPS := 5

var cell_size: float = 96.0
var base_radius: float = 28.0

var model: GridModel: set = _set_model
var selected_id: int = -1
var hint_id: int = -1

var rotation_basis: Basis = Basis()
var rotation_active: bool = false
var rotation_duration: float = 0.35
var rotation_timeout_secs: float = 1.0
var rotation_deadline: float = 0.0
var _tween_from: Quaternion
var _tween_to: Quaternion
var dot_states: Dictionary = {}
var dot_anim_speed: float = 10.0
var edge_states: Dictionary = {}
var edge_anim_speed: float = 8.0
var float_time: float = 0.0
var float_amp_factor: float = 0.018
var float_speed: float = 0.25

signal rotation_finished

func _ready() -> void:
	set_process(true)

func _set_model(value: GridModel) -> void:
	model = value
	rotation_basis = Basis()
	dot_states.clear()
	edge_states.clear()
	hint_id = -1
	_update_metrics()
	queue_redraw()

func _process(delta: float) -> void:
	if rotation_active:
		var now := float(Time.get_ticks_msec()) / 1000.0
		if now > rotation_deadline:
			_finish_rotation()
	_sync_edge_states()
	var dirty := false
	float_time += delta * float_speed
	dirty = true
	for key in dot_states.keys():
		var state: Dictionary = dot_states[key]
		if float(state.t) < 1.0:
			state.t = minf(1.0, float(state.t) + delta * dot_anim_speed)
			dot_states[key] = state
			dirty = true
	for key in edge_states.keys():
		var state: Dictionary = edge_states[key]
		var target: float = float(state.target)
		var t: float = float(state.t)
		if t != target:
			t = move_toward(t, target, delta * edge_anim_speed)
			state.t = t
			edge_states[key] = state
			dirty = true
		if t <= 0.0 and target <= 0.0:
			edge_states.erase(key)
	if dirty:
		queue_redraw()

func _update_metrics() -> void:
	if model == null:
		return
	var vp := get_viewport_rect().size
	var pad_x := 100.0
	var pad_y := 180.0
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	var span: int = maxi(max_dim - 1, 1)
	var max_cell_x: float = (vp.x - pad_x) / float(span)
	var max_cell_y: float = (vp.y - pad_y) / float(span)
	cell_size = clampf(minf(max_cell_x, max_cell_y), 68.0, 160.0)
	cell_size = clampf(cell_size * 0.95, 68.0, 170.0)
	base_radius = cell_size * 0.28

func is_rotating() -> bool:
	return rotation_active

func apply_drag(delta: Vector2, sensitivity: float) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var yaw_angle: float = -delta.x * sensitivity
	var pitch_angle: float = -delta.y * sensitivity
	if absf(yaw_angle) > 0.000001:
		rotation_basis = Basis(Vector3.UP, yaw_angle) * rotation_basis
	if absf(pitch_angle) > 0.000001:
		rotation_basis = Basis(Vector3.RIGHT, pitch_angle) * rotation_basis
	rotation_basis = rotation_basis.orthonormalized()
	queue_redraw()

func rotate_step(dir: Vector2) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target: Basis = rotation_basis
	if absf(dir.x) >= absf(dir.y):
		if dir.x != 0:
			var yaw_angle: float = -sign(dir.x) * PI / 2.0
			target = Basis(Vector3.UP, yaw_angle) * target
	else:
		if dir.y != 0:
			var pitch_angle: float = -sign(dir.y) * PI / 2.0
			target = Basis(Vector3.RIGHT, pitch_angle) * target
	_animate_to_basis(target.orthonormalized())

func snap_to_nearest() -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target := _best_orientation_basis()
	_animate_to_basis(target)

func _animate_to_basis(target: Basis) -> void:
	rotation_active = true
	var now := float(Time.get_ticks_msec()) / 1000.0
	rotation_deadline = now + maxf(rotation_duration + 0.25, rotation_timeout_secs)
	_tween_from = rotation_basis.get_rotation_quaternion()
	_tween_to = target.get_rotation_quaternion()
	var tween := create_tween()
	tween.tween_method(_set_rotation_slerp, 0.0, 1.0, rotation_duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.finished.connect(_finish_rotation)

func _set_rotation_slerp(t: float) -> void:
	var q := _tween_from.slerp(_tween_to, t)
	rotation_basis = Basis(q).orthonormalized()
	queue_redraw()

func _finish_rotation() -> void:
	if not rotation_active:
		return
	rotation_active = false
	rotation_deadline = 0.0
	rotation_finished.emit()

func _draw() -> void:
	if model == null:
		return
	_update_metrics()
	var nodes := _compute_nodes()
	_sync_edge_states()
	draw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), COLOR_BG)
	var positions := {}
	var items: Array = []
	for n in nodes:
		positions[n.id] = n
		items.append({"kind": "node", "depth": n.depth, "node": n})
	for key in edge_states.keys():
		var state: Dictionary = edge_states[key]
		var t: float = float(state.t)
		if t <= 0.0:
			continue
		var pair := model.decode_edge(key)
		var a := pair.x
		var b := pair.y
		if not positions.has(a) or not positions.has(b):
			continue
		var fa: float = positions[a].fade
		var fb: float = positions[b].fade
		var fade := minf(fa, fb)
		var depth: float = (float(positions[a].depth) + float(positions[b].depth)) * 0.5 - 0.0001
		items.append({
			"kind": "edge",
			"depth": depth,
			"a": a,
			"b": b,
			"fade": fade,
			"t": t
		})
	items.sort_custom(func(a, b): return a.depth < b.depth)
	for item in items:
		if item.kind == "edge":
			_draw_edge_item(item, positions)
		else:
			_draw_node_item(item.node)

func _sync_edge_states() -> void:
	if model == null:
		edge_states.clear()
		return
	var present := {}
	for key in model.placed_edges.keys():
		present[key] = true
		if not edge_states.has(key):
			edge_states[key] = {"t": 0.0, "target": 1.0}
		else:
			var state: Dictionary = edge_states[key]
			state.target = 1.0
			edge_states[key] = state
	for key in edge_states.keys():
		if not present.has(key):
			var state: Dictionary = edge_states[key]
			state.target = 0.0
			edge_states[key] = state

func pick_node(global_pos: Vector2) -> int:
	if model == null:
		return -1
	if rotation_active:
		return -1
	var nodes := _compute_nodes()
	var best_id := -1
	var best_score := 1e9
	for n in nodes:
		if n.fade < PICK_FADE_MIN:
			continue
		var blur := clampf(float(n.get("blur", 1.0)), 0.0, 1.0)
		if blur > PICK_BLUR_MAX:
			continue
		var pos: Vector2 = n.pos
		var radius: float = n.radius
		var d := pos.distance_to(global_pos)
		var pick_radius := radius * lerpf(1.2, 1.35, blur)
		if d <= pick_radius:
			var score := (d / maxf(1.0, radius)) + blur * 0.65
			if score < best_score:
				best_score = score
				best_id = n.id
	return best_id

func _compute_nodes() -> Array:
	var out: Array = []
	var center := get_viewport_rect().size * 0.5
	var cam_dist := _camera_distance()
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		var c := model.coords(node_id)
		var p := _node_position(c) + _float_offset(node_id)
		var r := _rotate_vec(p)
		var depth := cam_dist - r.z
		if depth <= 0.1:
			continue
		var scale := cam_dist / depth
		var screen := center + Vector2(r.x, -r.y) * scale
		var radius := base_radius * scale
		var fade := _fade_from_depth(r.z)
		var face_z := _node_face_z(c)
		var face_fade := clampf(face_z, 0.0, 1.0)
		fade = maxf(fade, face_fade)
		var blur := clampf(pow(1.0 - face_fade, 1.15), 0.0, 1.0)
		out.append({"id": node_id, "pos": screen, "depth": r.z, "radius": radius, "fade": fade, "blur": blur})
	out.sort_custom(func(a, b): return a.depth < b.depth)
	return out

func _draw_edge_item(item: Dictionary, positions: Dictionary) -> void:
	var a: int = item.a
	var b: int = item.b
	var t: float = clampf(float(item.t), 0.0, 1.0)
	var color := _edge_color(float(item.fade))
	color.a *= t
	var start: Vector2 = positions[a].pos
	var end: Vector2 = positions[b].pos
	var dir := end - start
	var len := dir.length()
	if len < 0.001:
		return
	var unit := dir / len
	var ra: float = positions[a].radius
	var rb: float = positions[b].radius
	var inset_a := minf(ra * 0.9, len * 0.45)
	var inset_b := minf(rb * 0.9, len * 0.45)
	start += unit * inset_a
	end -= unit * inset_b
	var mid := (start + end) * 0.5
	var half := (end - start) * 0.5 * t
	start = mid - half
	end = mid + half
	draw_line(start, end, color, maxf(2.0, base_radius * 0.18))

func _draw_node_item(n: Dictionary) -> void:
	var node_id: int = n.id
	var pos: Vector2 = n.pos
	var radius: float = n.radius
	var fade: float = n.fade
	var blur_strength: float = clampf(float(n.get("blur", 0.0)), 0.0, 1.0)
	if blur_strength > 0.02:
		_draw_depth_blur(pos, radius, fade, blur_strength)
	var fill_color := _tint_color(COLOR_BG, fade)
	var quiet_color := _tint_color(COLOR_QUIET, fade)
	var circle_color := _tint_color(COLOR_CIRCLE, fade)
	var dot_color := _tint_color(COLOR_DOT, fade)
	fill_color = fill_color.lerp(COLOR_BG, blur_strength * 0.34)
	quiet_color = quiet_color.lerp(COLOR_BG, blur_strength * 0.45)
	circle_color = circle_color.lerp(COLOR_BG, blur_strength * 0.62)
	dot_color = dot_color.lerp(COLOR_BG, blur_strength * 0.74)
	# Opaque fill to occlude nodes behind.
	draw_circle(pos, maxf(2.0, radius - maxf(0.5, radius * 0.08)), fill_color)
	if model.remaining_dots(node_id) == 0:
		draw_circle(pos, maxf(2.0, radius - 1.2), quiet_color)
	var ring_alpha := lerpf(1.0, 0.42, blur_strength)
	var ring_width := maxf(1.6, radius * lerpf(0.12, 0.18, blur_strength))
	circle_color.a *= ring_alpha
	draw_arc(pos, radius, 0.0, TAU, 48, circle_color, ring_width)
	if node_id == selected_id:
		var sel_color := _tint_color(COLOR_SELECTED, maxf(fade, 0.6))
		draw_arc(pos, radius + 4.0, 0.0, TAU, 48, sel_color, maxf(1.6, radius * 0.12))
	if node_id == hint_id:
		var hint_color := _tint_color(COLOR_SELECTED, maxf(fade, 0.55))
		draw_arc(pos, radius + 8.0, 0.0, TAU, 48, hint_color, maxf(1.4, radius * 0.1))
	dot_color.a *= lerpf(1.0, 0.14, blur_strength)
	if dot_color.a > 0.02:
		_draw_dots(node_id, pos, model.remaining_dots(node_id), radius, dot_color)

func _draw_depth_blur(pos: Vector2, radius: float, fade: float, blur_strength: float) -> void:
	var fog := clampf(1.0 - fade, 0.0, 1.0)
	var base := _tint_color(COLOR_CIRCLE, maxf(0.15, fade * 0.75)).lerp(COLOR_BG, lerpf(0.45, 0.72, fog))
	var layers := maxi(1, int(round(lerpf(1.0, float(DEPTH_BLUR_STEPS), blur_strength))))
	for i in range(layers, 0, -1):
		var t := float(i) / float(layers)
		var blur_color := base
		var max_alpha := lerpf(0.03, 0.22, blur_strength)
		blur_color.a = max_alpha * t
		var spread := radius * lerpf(0.05, 0.55, blur_strength) * t
		var blur_radius := radius + spread
		draw_circle(pos, blur_radius, blur_color)

func _draw_dots(node_id: int, pos: Vector2, count: int, radius: float, color: Color) -> void:
	if count <= 0:
		dot_states.erase(node_id)
		return
	var dr: float = maxf(2.0, radius * 0.16)
	var spacing: float = radius * 0.36
	var target_offsets := _dot_offsets(count, spacing)
	var state: Dictionary = {}
	if dot_states.has(node_id):
		state = dot_states[node_id]
	if state.is_empty():
		state = {"count": count, "from": target_offsets, "to": target_offsets, "t": 1.0}
	else:
		if int(state.count) != count:
			var current_offsets := _interpolate_offsets(state.from, state.to, float(state.t))
			var mapped_from: Array = []
			for i in range(target_offsets.size()):
				if i < current_offsets.size():
					mapped_from.append(current_offsets[i])
				else:
					mapped_from.append(Vector2.ZERO)
			state = {"count": count, "from": mapped_from, "to": target_offsets, "t": 0.0}
	dot_states[node_id] = state
	var offsets := _interpolate_offsets(state.from, state.to, float(state.t))
	for i in range(min(count, offsets.size())):
		draw_circle(pos + offsets[i], dr, color)

func _dot_offsets(count: int, spacing: float) -> Array:
	var out: Array = []
	if count <= 0:
		return out
	if count == 1:
		out.append(Vector2.ZERO)
		return out
	if count == 2:
		out.append(Vector2(-spacing, 0.0))
		out.append(Vector2(spacing, 0.0))
		return out
	if count == 3:
		out.append(Vector2(0.0, -spacing * 0.9))
		out.append(Vector2(-spacing, spacing * 0.7))
		out.append(Vector2(spacing, spacing * 0.7))
		return out
	out.append(Vector2(-spacing, -spacing))
	out.append(Vector2(spacing, -spacing))
	out.append(Vector2(-spacing, spacing))
	out.append(Vector2(spacing, spacing))
	return out

func _interpolate_offsets(from: Array, to: Array, t: float) -> Array:
	var out: Array = []
	for i in range(to.size()):
		var a: Vector2 = Vector2.ZERO
		if i < from.size():
			a = from[i]
		var b: Vector2 = to[i]
		out.append(a.lerp(b, t))
	return out

func _float_offset(node_id: int) -> Vector3:
	var amp := cell_size * float_amp_factor
	var seed := float(node_id)
	var ox := sin(float_time + seed * 0.37) * amp
	var oy := cos(float_time * 0.8 + seed * 0.53) * amp * 0.8
	return Vector3(ox, oy, 0.0)

func get_front_face() -> int:
	return _front_face_for_basis(rotation_basis)

func snap_to_face(face_id: int) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target := _basis_for_front_face(face_id)
	_animate_to_basis(target)

func is_node_on_front_face(node_id: int) -> bool:
	return _is_node_on_front_face(node_id)

func best_face_for_node(node_id: int) -> int:
	if model == null:
		return FACE_FRONT
	var c := model.coords(node_id)
	var candidates: Array = []
	if c.z == 0:
		candidates.append(FACE_FRONT)
	if c.z == model.nz - 1:
		candidates.append(FACE_BACK)
	if c.x == 0:
		candidates.append(FACE_LEFT)
	if c.x == model.nx - 1:
		candidates.append(FACE_RIGHT)
	if c.y == 0:
		candidates.append(FACE_TOP)
	if c.y == model.ny - 1:
		candidates.append(FACE_BOTTOM)
	if candidates.is_empty():
		return get_front_face()
	var best_face: int = int(candidates[0])
	var best_z: float = -1e9
	for face_id in candidates:
		var face_val: int = int(face_id)
		var normal := _face_normal(face_val)
		var rn := rotation_basis * normal
		if rn.z > best_z:
			best_z = rn.z
			best_face = face_val
	return best_face

func _front_face_for_basis(basis: Basis) -> int:
	var normals := {
		FACE_FRONT: Vector3(0, 0, 1),
		FACE_BACK: Vector3(0, 0, -1),
		FACE_LEFT: Vector3(-1, 0, 0),
		FACE_RIGHT: Vector3(1, 0, 0),
		FACE_TOP: Vector3(0, 1, 0),
		FACE_BOTTOM: Vector3(0, -1, 0)
	}
	var best_face := FACE_FRONT
	var best_z := -1e9
	for face_id in normals.keys():
		var normal: Vector3 = normals[face_id]
		var rn: Vector3 = basis * normal
		if rn.z > best_z:
			best_z = rn.z
			best_face = face_id
	return best_face

func _face_normal(face_id: int) -> Vector3:
	match face_id:
		FACE_FRONT:
			return Vector3(0, 0, 1)
		FACE_BACK:
			return Vector3(0, 0, -1)
		FACE_LEFT:
			return Vector3(-1, 0, 0)
		FACE_RIGHT:
			return Vector3(1, 0, 0)
		FACE_TOP:
			return Vector3(0, 1, 0)
		FACE_BOTTOM:
			return Vector3(0, -1, 0)
		_:
			return Vector3(0, 0, 1)

func _basis_for_front_face(face_id: int) -> Basis:
	var candidates: Array = _candidate_orientations()
	var best: Basis = rotation_basis
	var best_score := -1e9
	for b in candidates:
		if _front_face_for_basis(b) != face_id:
			continue
		var score := rotation_basis.x.dot(b.x) + rotation_basis.y.dot(b.y) + rotation_basis.z.dot(b.z)
		if score > best_score:
			best_score = score
			best = b
	return best

func _fade_from_depth(z: float) -> float:
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	var range := float(max_dim) * cell_size * 0.8
	var t := clampf((z + range) / (2.0 * range), 0.0, 1.0)
	t = pow(t, 1.45)
	return lerpf(FADE_BACK, FADE_FRONT, t)

func _tint_color(base: Color, fade: float) -> Color:
	var t := clampf(1.0 - fade, 0.0, 1.0)
	var washed := base.lerp(COLOR_BG, t * 0.85)
	var factor := lerpf(0.6, 1.0, fade)
	return Color(washed.r * factor, washed.g * factor, washed.b * factor, 1.0)

func _edge_color(fade: float) -> Color:
	var color := _tint_color(COLOR_EDGE, fade)
	var fog := clampf(1.0 - fade, 0.0, 1.0)
	var fog_color := COLOR_BG
	var fog_strength := lerpf(0.15, 0.7, fog)
	return color.lerp(fog_color, fog_strength)

func _is_node_on_front_face(node_id: int) -> bool:
	if model == null:
		return false
	if model.nz <= 1:
		return true
	var c := model.coords(node_id)
	match get_front_face():
		FACE_FRONT:
			return c.z == 0
		FACE_BACK:
			return c.z == model.nz - 1
		FACE_LEFT:
			return c.x == 0
		FACE_RIGHT:
			return c.x == model.nx - 1
		FACE_TOP:
			return c.y == 0
		FACE_BOTTOM:
			return c.y == model.ny - 1
		_:
			return false

func _node_face_z(c: Vector3i) -> float:
	var max_z := -1.0
	if c.x == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(-1, 0, 0)).z)
	if c.x == model.nx - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(1, 0, 0)).z)
	if c.y == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 1, 0)).z)
	if c.y == model.ny - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, -1, 0)).z)
	if c.z == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 0, 1)).z)
	if c.z == model.nz - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 0, -1)).z)
	return max_z

func _node_position(c: Vector3i) -> Vector3:
	var center_x := float(model.nx - 1) * 0.5
	var center_y := float(model.ny - 1) * 0.5
	var center_z := float(model.nz - 1) * 0.5
	var px := float(c.x) - center_x
	var py := -(float(c.y) - center_y)
	var pz := (center_z - float(c.z))
	return Vector3(px, py, pz) * cell_size

func _rotate_vec(v: Vector3) -> Vector3:
	return rotation_basis * v

func _camera_distance() -> float:
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	return cell_size * max_dim * 2.6

func _best_orientation_basis() -> Basis:
	var candidates: Array = _candidate_orientations()
	var best: Basis = candidates[0]
	var best_score := -1e9
	for b in candidates:
		var score := rotation_basis.x.dot(b.x) + rotation_basis.y.dot(b.y) + rotation_basis.z.dot(b.z)
		if score > best_score:
			best_score = score
			best = b
	return best

func _candidate_orientations() -> Array:
	var out: Array = []
	var dirs := [
		Vector3(1, 0, 0), Vector3(-1, 0, 0),
		Vector3(0, 1, 0), Vector3(0, -1, 0),
		Vector3(0, 0, 1), Vector3(0, 0, -1)
	]
	for x in dirs:
		for y in dirs:
			if absf(x.dot(y)) > 0.001:
				continue
			var z: Vector3 = x.cross(y)
			if z.length() < 0.5:
				continue
			out.append(Basis(x, y, z))
	return out
