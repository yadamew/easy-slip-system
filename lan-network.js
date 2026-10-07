// Interface names are hints, not a guarantee of reachability from another device.
export function getLanNetworks(interfaces) {
    const virtual = /docker|wsl|hyper[- ]?v|vethernet|virtual|vmware|vbox|virtualbox|loopback|vpn|tailscale|zerotier|wireguard|bluetooth|\btun\d*\b|\btap\d*\b|\bveth|\bbr-/i;
    const networks = [];
    for (const [name, entries] of Object.entries(interfaces)) {
        if (virtual.test(name)) continue;
        for (const entry of entries || []) {
            if (entry.family !== 'IPv4' || entry.internal || /^(127\.|169\.254\.|0\.)/.test(entry.address)) continue;
            const rank = /wi[- ]?fi|wireless|wlan/i.test(name) ? 0 : /ethernet|\beth\d|\ben\d/i.test(name) ? 1 : 2;
            networks.push({name,address:entry.address,rank});
        }
    }
    return networks.sort((a,b)=>a.rank-b.rank || a.name.localeCompare(b.name))
        .filter((entry,index,all)=>all.findIndex(other=>other.address===entry.address)===index);
}
