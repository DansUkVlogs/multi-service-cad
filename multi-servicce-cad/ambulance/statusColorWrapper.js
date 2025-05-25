export async function getStatusColor(status) {
    const module = await import("../dispatch/statusColor.js");
    const getStatusColorFn = module.default || module.getStatusColor; // Dynamically access the function
    if (typeof getStatusColorFn !== "function") {
        throw new Error("getStatusColor is not a function in statusColor.js");
    }
    return getStatusColorFn(status);
}
