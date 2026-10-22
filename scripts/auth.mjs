export async function authorize(hubApi, hub, actor, policy) {
  const result = await hubApi.request('GET', `/repos/${hub}/collaborators/${encodeURIComponent(actor)}/permission`);
  if (!policy.requester_permissions.includes(result.permission)) {
    throw new Error('Only an authorized governance repository collaborator may trigger publication or validation. Ask a maintainer to comment /publish.');
  }
}
