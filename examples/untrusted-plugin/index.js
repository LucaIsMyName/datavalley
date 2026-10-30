export default async function plugin(host) {
  return {
    id: 'echo',
    sawSecrets: host.envKeys,
    tokenPresent: Boolean(host.token),
  }
}
