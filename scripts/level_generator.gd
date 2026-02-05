class_name LevelGenerator
extends RefCounted

func generate(
	nx: int,
	ny: int,
	nz: int = 1,
	density: float = 0.4,
	seed: int = -1,
	min_nonzero_ratio: float = 0.4,
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

		if ratio > best_ratio:
			best_ratio = ratio
			best_edges = solution_edges
			best_deg = deg

		if ratio >= min_nonzero_ratio:
			model.solution_edges = solution_edges
			model.required = deg
			model.placed_edges.clear()
			return model

	model.solution_edges = best_edges
	model.required = best_deg
	model.placed_edges.clear()
	return model

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
