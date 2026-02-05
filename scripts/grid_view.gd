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

var cell_size: float = 96.0
var base_radius: float = 28.0

var model: GridModel: set = _set_model
var selected_id: int = -1

var rotation_basis: Basis = Basis()
var rotation_active: bool = false
var rotation_duration: float = 0.35
var _tween_from: Quaternion
var _tween_to: Quaternion

signal rotation_finished

func _set_model(value: GridModel) -> void:
	model = value
	rotation_basis = Basis()
	_update_metrics()
	queue_redraw()

func _update_metrics() -> void:
	if model == null:
		return
	var vp := get_viewport_rect().size
	var pad_x := 140.0
	var pad_y := 220.0
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	var span: int = maxi(max_dim - 1, 1)
	var max_cell_x: float = (vp.x - pad_x) / float(span)
	var max_cell_y: float = (vp.y - pad_y) / float(span)
	cell_size = clampf(minf(max_cell_x, max_cell_y), 72.0, 170.0)
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
	rotation_active = false
	rotation_finished.emit()

func _draw() -> void:
	if model == null:
		return
	_update_metrics()
	var nodes := _compute_nodes()
	draw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), COLOR_BG)
	var front_nodes: Array = []
	var back_nodes: Array = []
	for n in nodes:
		if _is_node_on_front_face(n.id):
			front_nodes.append(n)
		else:
			back_nodes.append(n)
	_draw_nodes_list(back_nodes)
	_draw_edges(nodes)
	_draw_nodes_list(front_nodes)

func pick_node(global_pos: Vector2) -> int:
	if model == null:
		return -1
	if rotation_active:
		return -1
	var nodes := _compute_nodes()
	var best_id := -1
	var best_dist := 1e9
	for n in nodes:
		if n.fade < PICK_FADE_MIN:
			continue
		if not _is_node_on_front_face(n.id):
			continue
		var pos: Vector2 = n.pos
		var radius: float = n.radius
		var d := pos.distance_to(global_pos)
		if d <= radius * 1.2 and d < best_dist:
			best_dist = d
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
		var p := _node_position(c)
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
		out.append({"id": node_id, "pos": screen, "depth": r.z, "radius": radius, "fade": fade})
	out.sort_custom(func(a, b): return a.depth < b.depth)
	return out

func _draw_edges(nodes: Array) -> void:
	var positions := {}
	for n in nodes:
		positions[n.id] = {"pos": n.pos, "fade": n.fade, "radius": n.radius}
	var keys := model.placed_edges.keys()
	for key in keys:
		var pair := model.decode_edge(key)
		var a := pair.x
		var b := pair.y
		if not positions.has(a) or not positions.has(b):
			continue
		var fa: float = positions[a].fade
		var fb: float = positions[b].fade
		var fade := minf(fa, fb)
		var color := _edge_color(fade)
		var start: Vector2 = positions[a].pos
		var end: Vector2 = positions[b].pos
		var dir := end - start
		var len := dir.length()
		if len < 0.001:
			continue
		var unit := dir / len
		var ra: float = positions[a].radius
		var rb: float = positions[b].radius
		var inset_a := minf(ra * 0.9, len * 0.45)
		var inset_b := minf(rb * 0.9, len * 0.45)
		start += unit * inset_a
		end -= unit * inset_b
		draw_line(start, end, color, maxf(2.0, base_radius * 0.18))

func _draw_nodes_list(nodes: Array) -> void:
	for n in nodes:
		var node_id: int = n.id
		var pos: Vector2 = n.pos
		var radius: float = n.radius
		var fade: float = n.fade
		var fill_color := _tint_color(COLOR_BG, fade)
		var quiet_color := _tint_color(COLOR_QUIET, fade)
		var circle_color := _tint_color(COLOR_CIRCLE, fade)
		var dot_color := _tint_color(COLOR_DOT, fade)
		# Opaque fill to occlude nodes behind.
		draw_circle(pos, maxf(2.0, radius - maxf(1.0, radius * 0.12)), fill_color)
		if model.remaining_dots(node_id) == 0:
			draw_circle(pos, maxf(2.0, radius - 2.0), quiet_color)
		draw_arc(pos, radius, 0.0, TAU, 48, circle_color, maxf(1.6, radius * 0.12))
		if node_id == selected_id:
			var sel_color := _tint_color(COLOR_SELECTED, maxf(fade, 0.6))
			draw_arc(pos, radius + 4.0, 0.0, TAU, 48, sel_color, maxf(1.6, radius * 0.12))
		_draw_dots(pos, model.remaining_dots(node_id), radius, dot_color)

func _draw_dots(pos: Vector2, count: int, radius: float, color: Color) -> void:
	if count <= 0:
		return
	var dr: float = maxf(2.0, radius * 0.16)
	var spacing: float = radius * 0.4
	if count == 1:
		draw_circle(pos, dr, color)
		return
	var offsets := [
		Vector2(-spacing, -spacing),
		Vector2(spacing, -spacing),
		Vector2(-spacing, spacing),
		Vector2(spacing, spacing)
	]
	for i in range(min(count, 4)):
		draw_circle(pos + offsets[i], dr, color)

func get_front_face() -> int:
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
		var rn := _rotate_vec(normals[face_id])
		if rn.z > best_z:
			best_z = rn.z
			best_face = face_id
	return best_face

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
	var extra := lerpf(0.45, 1.0, fade)
	return Color(color.r * extra, color.g * extra, color.b * extra, 1.0)

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
