class_name GridModel
extends RefCounted

const EDGE_SHIFT := 32
const EDGE_MASK := int((1 << EDGE_SHIFT) - 1)

var nx: int
var ny: int
var nz: int

var required: PackedInt32Array = PackedInt32Array()
var solution_edges: Dictionary = {}
var placed_edges: Dictionary = {}
var active: PackedByteArray = PackedByteArray()

func _init(nx_in: int, ny_in: int, nz_in: int = 1) -> void:
	nx = nx_in
	ny = ny_in
	nz = nz_in
	var total := total_nodes()
	required.resize(total)
	active.resize(total)
	for i in range(total):
		required[i] = 0
		active[i] = 1

func set_surface_only(enabled: bool) -> void:
	if not enabled:
		for i in range(active.size()):
			active[i] = 1
		return

	for i in range(total_nodes()):
		var c := coords(i)
		if c.x == 0 or c.x == nx - 1 or c.y == 0 or c.y == ny - 1 or c.z == 0 or c.z == nz - 1:
			active[i] = 1
		else:
			active[i] = 0

func is_active(node_id: int) -> bool:
	if node_id < 0 or node_id >= active.size():
		return false
	return active[node_id] == 1

func total_nodes() -> int:
	return nx * ny * nz

func id(x: int, y: int, z: int) -> int:
	return x + nx * (y + ny * z)

func coords(node_id: int) -> Vector3i:
	var stride_z := nx * ny
	var z := node_id / stride_z
	var rem := node_id - z * stride_z
	var y := rem / nx
	var x := rem - y * nx
	return Vector3i(x, y, z)

func in_bounds(x: int, y: int, z: int) -> bool:
	return x >= 0 and x < nx and y >= 0 and y < ny and z >= 0 and z < nz

func neighbors(node_id: int) -> Array:
	if not is_active(node_id):
		return []
	var out: Array = []
	var c := coords(node_id)
	var stride_y := nx
	var stride_z := nx * ny
	if c.x > 0:
		if is_active(node_id - 1):
			out.append(node_id - 1)
	if c.x < nx - 1:
		if is_active(node_id + 1):
			out.append(node_id + 1)
	if c.y > 0:
		if is_active(node_id - stride_y):
			out.append(node_id - stride_y)
	if c.y < ny - 1:
		if is_active(node_id + stride_y):
			out.append(node_id + stride_y)
	if c.z > 0:
		if is_active(node_id - stride_z):
			out.append(node_id - stride_z)
	if c.z < nz - 1:
		if is_active(node_id + stride_z):
			out.append(node_id + stride_z)
	return out

func is_neighbor(a: int, b: int) -> bool:
	var ca := coords(a)
	var cb := coords(b)
	return (abs(ca.x - cb.x) + abs(ca.y - cb.y) + abs(ca.z - cb.z)) == 1

func edge_key(a: int, b: int) -> int:
	if a > b:
		var t := a
		a = b
		b = t
	return (a << EDGE_SHIFT) | b

func decode_edge(key: int) -> Vector2i:
	var a := key >> EDGE_SHIFT
	var b := key & EDGE_MASK
	return Vector2i(a, b)

func placed_edge_exists(a: int, b: int) -> bool:
	return placed_edges.has(edge_key(a, b))

func add_placed_edge(a: int, b: int) -> bool:
	if not is_neighbor(a, b):
		return false
	if placed_edge_exists(a, b):
		return false
	if placed_degree(a) >= required[a]:
		return false
	if placed_degree(b) >= required[b]:
		return false
	placed_edges[edge_key(a, b)] = true
	return true

func remove_placed_edge(a: int, b: int) -> bool:
	var key := edge_key(a, b)
	if not placed_edges.has(key):
		return false
	placed_edges.erase(key)
	return true

func placed_degree(node_id: int) -> int:
	var count := 0
	for nb in neighbors(node_id):
		if placed_edge_exists(node_id, nb):
			count += 1
	return count

func solution_degree(node_id: int) -> int:
	var count := 0
	for nb in neighbors(node_id):
		if solution_edges.has(edge_key(node_id, nb)):
			count += 1
	return count

func remaining_dots(node_id: int) -> int:
	if not is_active(node_id):
		return 0
	return max(required[node_id] - placed_degree(node_id), 0)

func required_node_count() -> int:
	var count := 0
	for i in range(total_nodes()):
		if not is_active(i):
			continue
		if required[i] <= 0:
			continue
		count += 1
	return count

func connected_required_count() -> int:
	var start := -1
	for i in range(total_nodes()):
		if not is_active(i):
			continue
		if required[i] <= 0:
			continue
		start = i
		break
	if start == -1:
		return 0
	var visited := {}
	var stack: Array = [start]
	visited[start] = true
	while not stack.is_empty():
		var node_id := int(stack.pop_back())
		for nb in neighbors(node_id):
			if required[nb] <= 0:
				continue
			if not placed_edge_exists(node_id, nb):
				continue
			if visited.has(nb):
				continue
			visited[nb] = true
			stack.append(nb)
	return visited.size()

func is_required_network_connected() -> bool:
	var required_count := required_node_count()
	if required_count <= 1:
		return true
	return connected_required_count() == required_count

func is_solved() -> bool:
	for i in range(total_nodes()):
		if not is_active(i):
			continue
		if placed_degree(i) != required[i]:
			return false
	return true
