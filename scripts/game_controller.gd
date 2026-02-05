class_name GameController
extends Control

signal back_requested

const DEBUG_LOG_PATH := "user://input_debug.log"

const DIFFICULTY_EASY := 0
const DIFFICULTY_NORMAL := 1
const DIFFICULTY_HARD := 2

var model: GridModel
var selected_id: int = -1
var current_size: int = 5
var current_depth: int = 1
var current_difficulty: int = DIFFICULTY_NORMAL
var swipe_active: bool = false
var swipe_start: Vector2 = Vector2.ZERO
var swipe_last: Vector2 = Vector2.ZERO
var swipe_total: Vector2 = Vector2.ZERO
var drag_moved: bool = false
var pan_accum: Vector2 = Vector2.ZERO
var pan_last_time: float = 0.0
var pan_block_until: float = 0.0
var pan_active: bool = false
var pan_end_deadline: float = 0.0
var use_polling_input: bool = false
var poll_mouse_active: bool = false
var poll_touch_active: bool = false
var poll_mouse_last: Vector2 = Vector2.ZERO
var poll_touch_last: Vector2 = Vector2.ZERO
var key_state := {}

@onready var grid_view: GridView = $GridView
@onready var back_button: Button = $HUD/Root/TopBar/TopBarHBox/BackButton
@onready var restart_button: Button = $HUD/Root/TopBar/TopBarHBox/RestartButton
@onready var side_label: Label = $HUD/Root/TopBar/TopBarHBox/SideLabel
@onready var completion_panel: Panel = $HUD/Root/CompletionPanel
@onready var completion_label: Label = $HUD/Root/CompletionPanel/CompletionVBox/CompletionLabel
@onready var next_button: Button = $HUD/Root/CompletionPanel/CompletionVBox/NextButton
@onready var replay_button: Button = $HUD/Root/CompletionPanel/CompletionVBox/ReplayButton

func _ready() -> void:
	set_process_input(true)
	use_polling_input = OS.has_feature("web")
	back_button.pressed.connect(_on_back_pressed)
	restart_button.pressed.connect(_on_restart_pressed)
	next_button.pressed.connect(_on_next_pressed)
	replay_button.pressed.connect(_on_restart_pressed)
	grid_view.rotation_finished.connect(_update_side_ui)
	completion_panel.visible = false
	_log_debug("session start")

func start_new_game(size: int, depth: int, difficulty: int) -> void:
	current_size = size
	current_depth = depth
	current_difficulty = difficulty
	selected_id = -1
	_generate_model(-1)
	_update_side_ui()
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.queue_redraw()
	_release_ui_focus()

func _generate_model(seed: int) -> void:
	var params := _difficulty_params(current_difficulty)
	var gen := LevelGenerator.new()
	model = gen.generate(current_size, current_size, current_depth, params.density, seed, params.min_nonzero_ratio, params.max_attempts)
	grid_view.model = model

func _difficulty_params(difficulty: int) -> Dictionary:
	match difficulty:
		DIFFICULTY_EASY:
			return {"density": 0.32, "min_nonzero_ratio": 0.35, "max_attempts": 12}
		DIFFICULTY_HARD:
			return {"density": 0.52, "min_nonzero_ratio": 0.55, "max_attempts": 16}
		_:
			return {"density": 0.42, "min_nonzero_ratio": 0.45, "max_attempts": 14}

func _input(event: InputEvent) -> void:
	if event is InputEventPanGesture:
		_log_debug("pan gesture delta=%s" % [str(event.delta)])
		_handle_pan_gesture(event.delta)
		return
	if event is InputEventMouseButton and event.pressed:
		if _handle_wheel(event):
			return
	if use_polling_input:
		return
	if event is InputEventMouseButton and event.pressed:
		_log_pointer("mouse_down", event.position)
		_release_ui_focus()
		if event.button_index == MOUSE_BUTTON_LEFT:
			if _begin_swipe(event.position):
				_log_debug("swipe start")
	if event is InputEventScreenTouch and event.pressed:
		_log_pointer("touch_down", event.position)
		_release_ui_focus()
		if _begin_swipe(event.position):
			_log_debug("touch swipe start")
	if event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_handle_pointer_release(event.position)
	if event is InputEventScreenTouch and not event.pressed:
		_handle_pointer_release(event.position)
	if event is InputEventMouseMotion and swipe_active:
		_handle_drag_delta(event.relative, event.position)
	if event is InputEventScreenDrag and swipe_active:
		_handle_drag_delta(event.relative, event.position)
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_LEFT:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_RIGHT:
			_rotate_by_delta(Vector2(1, 0))
		elif event.keycode == KEY_UP:
			_rotate_by_delta(Vector2(0, -1))
		elif event.keycode == KEY_DOWN:
			_rotate_by_delta(Vector2(0, 1))
		elif event.keycode == KEY_A:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_D:
			_rotate_by_delta(Vector2(1, 0))
		elif event.keycode == KEY_W:
			_rotate_by_delta(Vector2(0, -1))
		elif event.keycode == KEY_S:
			_rotate_by_delta(Vector2(0, 1))
		elif event.keycode == KEY_BRACKETLEFT:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_BRACKETRIGHT:
			_rotate_by_delta(Vector2(1, 0))
func _handle_pointer_release(pos: Vector2) -> void:
	if not swipe_active:
		return
	if _is_pointer_over_ui(pos):
		swipe_active = false
		return
	if grid_view.is_rotating():
		swipe_active = false
		return
	swipe_active = false
	var threshold := _drag_threshold()
	if drag_moved or swipe_total.length() >= threshold:
		_log_debug("swipe release -> snap")
		if current_depth > 1:
			grid_view.snap_to_nearest()
	else:
		_log_debug("tap release")
		_handle_press(swipe_start)

func _handle_drag_motion(pos: Vector2) -> void:
	var delta := pos - swipe_last
	_handle_drag_delta(delta, pos)

func _handle_drag_delta(delta: Vector2, pos: Vector2) -> void:
	swipe_last = pos
	swipe_total += delta
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var threshold := _drag_threshold()
	if not drag_moved and swipe_total.length() >= threshold:
		drag_moved = true
		_log_debug("drag threshold reached")
	if drag_moved:
		grid_view.apply_drag(delta, _drag_sensitivity())

func _handle_pan_gesture(delta: Vector2) -> void:
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var now := float(Time.get_ticks_msec()) / 1000.0
	if now < pan_block_until:
		return
	if swipe_active:
		return
	pan_active = true
	pan_end_deadline = now + 0.18
	if now - pan_last_time > 0.15:
		pan_accum = Vector2.ZERO
	pan_last_time = now
	pan_accum += delta
	var threshold := maxf(8.0, _drag_threshold() * 0.6)
	if pan_accum.length() >= threshold:
		_log_debug("pan threshold reached accum=%s" % [str(pan_accum)])
		var dir := Vector2(pan_accum.x, pan_accum.y)
		if absf(dir.x) >= absf(dir.y):
			dir = Vector2(sign(dir.x), 0)
		else:
			dir = Vector2(0, sign(dir.y))
		pan_accum = Vector2.ZERO
		_rotate_by_delta(dir)
		pan_block_until = now + 1.0
		pan_active = false

func _process(_delta: float) -> void:
	if pan_active and float(Time.get_ticks_msec()) / 1000.0 > pan_end_deadline:
		pan_active = false
		pan_accum = Vector2.ZERO
	if use_polling_input:
		_poll_keyboard_web()
		_poll_pointer_web()

func _rotate_by_delta(dir: Vector2) -> void:
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var swipe_dir := dir.normalized()
	if swipe_dir == Vector2.ZERO:
		return
	grid_view.rotate_step(swipe_dir)

func _drag_threshold() -> float:
	var vp := get_viewport_rect().size
	return maxf(12.0, minf(vp.x, vp.y) * 0.02)

func _drag_sensitivity() -> float:
	var vp := get_viewport_rect().size
	return PI / maxf(240.0, minf(vp.x, vp.y))

func _begin_swipe(pos: Vector2) -> bool:
	if swipe_active:
		return false
	if _is_pointer_over_ui(pos):
		return false
	swipe_active = true
	swipe_start = pos
	swipe_last = pos
	swipe_total = Vector2.ZERO
	drag_moved = false
	return true

func _handle_wheel(event: InputEventMouseButton) -> bool:
	var dir := Vector2.ZERO
	match event.button_index:
		MOUSE_BUTTON_WHEEL_LEFT:
			dir = Vector2(-1, 0)
		MOUSE_BUTTON_WHEEL_RIGHT:
			dir = Vector2(1, 0)
		MOUSE_BUTTON_WHEEL_UP:
			dir = Vector2(0, -1)
		MOUSE_BUTTON_WHEEL_DOWN:
			dir = Vector2(0, 1)
	if dir == Vector2.ZERO:
		return false
	var now := float(Time.get_ticks_msec()) / 1000.0
	if now < pan_block_until:
		return true
	_rotate_by_delta(dir)
	pan_block_until = now + 0.6
	return true

func _poll_keyboard_web() -> void:
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var dir := Vector2.ZERO
	if _key_just_pressed(KEY_LEFT) or _key_just_pressed(KEY_A) or _key_just_pressed(KEY_BRACKETLEFT):
		dir = Vector2(-1, 0)
	elif _key_just_pressed(KEY_RIGHT) or _key_just_pressed(KEY_D) or _key_just_pressed(KEY_BRACKETRIGHT):
		dir = Vector2(1, 0)
	elif _key_just_pressed(KEY_UP) or _key_just_pressed(KEY_W):
		dir = Vector2(0, -1)
	elif _key_just_pressed(KEY_DOWN) or _key_just_pressed(KEY_S):
		dir = Vector2(0, 1)
	if dir != Vector2.ZERO:
		_rotate_by_delta(dir)

func _key_just_pressed(keycode: int) -> bool:
	var pressed := Input.is_key_pressed(keycode)
	var prev := false
	if key_state.has(keycode):
		prev = key_state[keycode]
	key_state[keycode] = pressed
	return pressed and not prev

func _poll_pointer_web() -> void:
	if Input.get_touch_count() > 0:
		var pos := Input.get_touch_position(0)
		if not poll_touch_active:
			poll_touch_active = _begin_swipe(pos)
		else:
			_handle_drag_motion(pos)
		poll_touch_last = pos
		return
	if poll_touch_active:
		_handle_pointer_release(poll_touch_last)
		poll_touch_active = false

	var pressed := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	var pos := get_viewport().get_mouse_position()
	if pressed:
		if not poll_mouse_active:
			poll_mouse_active = _begin_swipe(pos)
		else:
			_handle_drag_motion(pos)
		poll_mouse_last = pos
	elif poll_mouse_active:
		_handle_pointer_release(pos)
		poll_mouse_active = false

func _handle_press(pos: Vector2) -> void:
	_log_pointer("handle_press", pos)
	var node_id: int = grid_view.pick_node(pos)
	if node_id == -1:
		_clear_selection()
		return

	if selected_id == -1:
		selected_id = node_id
		grid_view.selected_id = node_id
		grid_view.queue_redraw()
		return

	if node_id == selected_id:
		_clear_selection()
		return

	if model.is_neighbor(selected_id, node_id):
		if model.placed_edge_exists(selected_id, node_id):
			model.remove_placed_edge(selected_id, node_id)
		else:
			model.add_placed_edge(selected_id, node_id)

	_clear_selection()

	if model.is_solved():
		_show_completion()

func _clear_selection() -> void:
	selected_id = -1
	grid_view.selected_id = -1
	grid_view.queue_redraw()

func _show_completion() -> void:
	completion_label.text = "Level Complete"
	completion_panel.visible = true
	var tween := create_tween()
	completion_panel.modulate = Color(1, 1, 1, 0)
	tween.tween_property(completion_panel, "modulate", Color(1, 1, 1, 1), 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

func _on_back_pressed() -> void:
	back_requested.emit()

func _on_restart_pressed() -> void:
	_generate_model(-1)
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.queue_redraw()

func _on_next_pressed() -> void:
	_generate_model(int(Time.get_ticks_msec()))
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.queue_redraw()

func _update_side_ui() -> void:
	if current_depth <= 1:
		side_label.text = "Side"
		return
	side_label.text = "Side: %s" % _face_name(grid_view.get_front_face())

func _face_name(face_id: int) -> String:
	match face_id:
		GridView.FACE_FRONT:
			return "Front"
		GridView.FACE_BACK:
			return "Back"
		GridView.FACE_LEFT:
			return "Left"
		GridView.FACE_RIGHT:
			return "Right"
		GridView.FACE_TOP:
			return "Top"
		GridView.FACE_BOTTOM:
			return "Bottom"
		_:
			return "Side"

func _log_pointer(tag: String, pos: Vector2) -> void:
	var node_id := -1
	if model != null:
		node_id = grid_view.pick_node(pos)
	var focus := get_viewport().gui_get_focus_owner()
	var focus_name := "none"
	if focus != null:
		focus_name = str(focus.get_path())
	var message := "%s pos=(%.1f,%.1f) node=%d selected=%d front=%s focus=%s" % [
		tag, pos.x, pos.y, node_id, selected_id, _face_name(grid_view.get_front_face()), focus_name
	]
	_log_debug(message)

func _is_pointer_over_ui(pos: Vector2) -> bool:
	var hovered := get_viewport().gui_get_hovered_control()
	if hovered == null:
		return false
	return _is_ui_control(hovered)

func _is_ui_control(node: Control) -> bool:
	var current: Node = node
	while current != null:
		if current == back_button:
			return true
		if current == restart_button:
			return true
		if current == next_button:
			return true
		if current == replay_button:
			return true
		if current == completion_panel:
			return true
		current = current.get_parent()
	return false

func _release_ui_focus() -> void:
	if OS.has_feature("web"):
		get_viewport().gui_release_focus()

func _log_debug(message: String) -> void:
	var file := FileAccess.open(DEBUG_LOG_PATH, FileAccess.READ_WRITE)
	if file == null:
		file = FileAccess.open(DEBUG_LOG_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.seek_end()
	file.store_line(message)
