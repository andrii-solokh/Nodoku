class_name LevelGenerator
extends RefCounted

func generate(
	nx: int,
	ny: int,
	nz: int = 1,
	density: float = 0.4,
	seed: int = -1,
	min_nonzero_ratio: float = 0.4,
	min_constraint_ratio: float = 0.24,
	max_attempts: int = 10
) -> GridModel:
	var model: GridModel = GridModel.new(nx, ny, nz)
	model.set_surface_only(nz > 1)
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	if seed >= 0:
		rng.seed = seed
	else:
		rng.randomize()

	var edges: Array = _all_possible_edges(model)
	var clamped_density: float = clampf(density, 0.0, 1.0)
	var best_ratio: float = -1.0
	var best_edges: Dictionary = {}
	var best_deg: PackedInt32Array = PackedInt32Array()
	var best_connected_quality: float = -1000000.0
	var best_connected_edges: Dictionary = {}
	var best_connected_deg: PackedInt32Array = PackedInt32Array()

	if edges.is_empty():
		return model

	for attempt in range(max_attempts):
		_shuffle(edges, rng)
		var target: int = max(1, int(round(edges.size() * clamped_density)))

		var solution_edges: Dictionary = {}
		var deg: PackedInt32Array = PackedInt32Array()
		deg.resize(model.total_nodes())
		for i in range(deg.size()):
			deg[i] = 0

		var picked: int = 0
		for e in edges:
			if picked >= target:
				break
			var a: int = e[0]
			var b: int = e[1]
			if deg[a] >= 4 or deg[b] >= 4:
				continue
			solution_edges[model.edge_key(a, b)] = true
			deg[a] += 1
			deg[b] += 1
			picked += 1

		var nonzero: int = 0
		for i in range(deg.size()):
			if deg[i] > 0:
				nonzero += 1
		var ratio: float = float(nonzero) / float(deg.size())
		var connected := _is_solution_connected(model, deg, solution_edges)
		var profile := _constraint_profile(model, deg)
		var constrained_ratio := float(profile.constrained_ratio)
		var avg_slack := float(profile.avg_slack)
		var quality := _candidate_quality(ratio, constrained_ratio, avg_slack)

		if ratio > best_ratio:
			best_ratio = ratio
			best_edges = solution_edges
			best_deg = deg

		if connected and quality > best_connected_quality:
			best_connected_quality = quality
			best_connected_edges = solution_edges
			best_connected_deg = deg

		if connected and ratio >= min_nonzero_ratio and constrained_ratio >= min_constraint_ratio:
			model.solution_edges = solution_edges
			model.required = deg
			model.placed_edges.clear()
			return model

	if not best_connected_edges.is_empty():
		model.solution_edges = best_connected_edges
		model.required = best_connected_deg
	else:
		var target_fallback: int = max(1, int(round(edges.size() * clamped_density)))
		var fallback := _build_connected_solution(model, target_fallback, rng)
		if not fallback.is_empty():
			model.solution_edges = fallback.edges
			model.required = fallback.deg
		else:
			model.solution_edges = best_edges
			model.required = best_deg
	model.placed_edges.clear()
	return model

func _constraint_profile(model: GridModel, deg: PackedInt32Array) -> Dictionary:
	var required_nodes := 0
	var constrained_nodes := 0
	var total_slack := 0
	for node_id in range(deg.size()):
		var req := int(deg[node_id])
		if req <= 0:
			continue
		required_nodes += 1
		var available := 0
		for nb in model.neighbors(node_id):
			if deg[nb] > 0:
				available += 1
		var slack := maxi(available - req, 0)
		total_slack += slack
		if slack <= 1:
			constrained_nodes += 1
	if required_nodes <= 0:
		return {"constrained_ratio": 0.0, "avg_slack": 999.0}
	return {
		"constrained_ratio": float(constrained_nodes) / float(required_nodes),
		"avg_slack": float(total_slack) / float(required_nodes)
	}

func _candidate_quality(nonzero_ratio: float, constrained_ratio: float, avg_slack: float) -> float:
	return (nonzero_ratio * 0.62) + (constrained_ratio * 0.38) - (avg_slack * 0.06)

func _all_possible_edges(model: GridModel) -> Array:
	var out: Array = []
	for node_id in range(model.total_nodes()):
		for nb in model.neighbors(node_id):
			if nb > node_id:
				out.append([node_id, nb])
	return out

func _shuffle(arr: Array, rng: RandomNumberGenerator) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j: int = rng.randi_range(0, i)
		var tmp: Array = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp

func _is_solution_connected(model: GridModel, deg: PackedInt32Array, solution_edges: Dictionary) -> bool:
	var start := -1
	var required_count := 0
	for i in range(deg.size()):
		if deg[i] <= 0:
			continue
		required_count += 1
		if start == -1:
			start = i
	if required_count <= 1:
		return true
	if start == -1:
		return false
	var visited := {}
	var stack: Array = [start]
	visited[start] = true
	while not stack.is_empty():
		var node_id := int(stack.pop_back())
		for nb in model.neighbors(node_id):
			if deg[nb] <= 0:
				continue
			if not solution_edges.has(model.edge_key(node_id, nb)):
				continue
			if visited.has(nb):
				continue
			visited[nb] = true
			stack.append(nb)
	return visited.size() == required_count

func _build_connected_solution(model: GridModel, target: int, rng: RandomNumberGenerator) -> Dictionary:
	var active_nodes: Array = _collect_active_nodes(model)
	if active_nodes.size() < 2:
		return {}
	var component_size := mini(active_nodes.size(), target + 1)
	component_size = maxi(component_size, 2)
	var in_component := {}
	var component_nodes: Array = []
	var seed := int(active_nodes[rng.randi_range(0, active_nodes.size() - 1)])
	in_component[seed] = true
	component_nodes.append(seed)
	var deg: PackedInt32Array = PackedInt32Array()
	deg.resize(model.total_nodes())
	for i in range(deg.size()):
		deg[i] = 0
	var solution_edges: Dictionary = {}
	var frontier: Array = []
	for nb in model.neighbors(seed):
		if model.is_active(nb):
			frontier.append({"from": seed, "to": nb})
	while component_nodes.size() < component_size and not frontier.is_empty():
		var pick := rng.randi_range(0, frontier.size() - 1)
		var item: Dictionary = frontier[pick]
		frontier[pick] = frontier[frontier.size() - 1]
		frontier.pop_back()
		var from := int(item.from)
		var to := int(item.to)
		if in_component.has(to):
			continue
		if deg[from] >= 4:
			continue
		solution_edges[model.edge_key(from, to)] = true
		deg[from] += 1
		deg[to] += 1
		in_component[to] = true
		component_nodes.append(to)
		for nb in model.neighbors(to):
			if not model.is_active(nb):
				continue
			if in_component.has(nb):
				continue
			frontier.append({"from": to, "to": nb})
	if component_nodes.size() < 2:
		return {}
	var all_edges := _all_possible_edges(model)
	_shuffle(all_edges, rng)
	for e in all_edges:
		if solution_edges.size() >= target:
			break
		var a: int = e[0]
		var b: int = e[1]
		if not in_component.has(a) or not in_component.has(b):
			continue
		var key := model.edge_key(a, b)
		if solution_edges.has(key):
			continue
		if deg[a] >= 4 or deg[b] >= 4:
			continue
		solution_edges[key] = true
		deg[a] += 1
		deg[b] += 1
	if not _is_solution_connected(model, deg, solution_edges):
		return {}
	return {"edges": solution_edges, "deg": deg}

func _collect_active_nodes(model: GridModel) -> Array:
	var out: Array = []
	for node_id in range(model.total_nodes()):
		if model.is_active(node_id):
			out.append(node_id)
	return out
