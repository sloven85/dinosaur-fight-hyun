# displayHeight(판정 키) vs 아트 bbox×4(렌더 크기)

| 종 | 아티스트 idle bbox(아트px) | 우리 재측정 | 아트×4 | displayHeight(판정) | 차이 |
|---|---|---|---|---|---|
| 티라노(tyrannosaurus) | 113 | 113 | 452 | 436 | +3.7% |
| 트리케라(triceratops) | 90 | 90 | 360 | 360 | +0.0% |
| 벨로키(velociraptor) | 86 | 86 | 344 | 344 | +0.0% |
| 스피노(spinosaurus) | 106 | 106 | 424 | 424 | +0.0% |
| 안킬로(ankylosaurus) | 82 | 82 | 328 | 328 | +0.0% |
| 스테고(stegosaurus) | 102 | 102 | 408 | 408 | +0.0% |
| 카르노(carnotaurus) | 107 | 107 | 428 | 428 | +0.0% |
| 파키(pachycephalosaurus) | 97 | 97 | 388 | 388 | +0.0% |
| 테리지노(therizinosaurus) | 112 | 112 | 448 | 448 | +0.0% |
| 딜로포(dilophosaurus) | 94 | 94 | 376 | 376 | +0.0% |
| 브라키오(brachiosaurus) | 152 | 152 | 608 | 608 | +0.0% |
| 프테라(pteranodon) | 87 | 87 | 348 | 348 | +0.0% |

출처: 아티스트 납품 `measure.json` (셀 502×304, idle 프레임 bbox 높이) — 파일 해시

- `trex` measure.json sha256 `6ff4d61846c95cc39a3d7598b85f23baa8daee016336b2d2e98e9ad27550b240` · idle PNG sha256 `7d1b5c7a9aa61c6900432a749d86289ee852960e00819ac1f0de7c3abc936d8c`, `b081e21059771ab03f17327157781e9f3e0522adccba4ff8d260f2cd7788fb1d`
- `trike` measure.json sha256 `9abaf363a1d310c2d5dcb19816166c5885c388d547db7f60ced7afb618b004aa` · idle PNG sha256 `259bcd1f1ed89b58c38a6465b63731b94f08f21490311f5a76988e738737dde4`, `388ad1cb796060925a4ee4d522c99d4cbf09601634c9ad0f9fd9a2ee1960a153`
- `velo` measure.json sha256 `e22fe9b69834790fbb6578afce271b1090cc62c556b347ecb8775e2aedf611e0` · idle PNG sha256 `0094f6251af741a28e60f12f9922109a2ab0900d5fd5e819e939692be2f003fc`, `a3a98c6de47761206363df8f1f91652f66d34be9e19b90102a7e5ff20ca7a9f3`
- `spino` measure.json sha256 `0f64bdb1098fe62d689c360ac2253aca21dbc7f2688bf8b81d17afc5ccb67875` · idle PNG sha256 `5e5e5177815287685077cddc5d4594f2746a8b23c5181f2009e666641e1b0d9c`, `9023a411938d07a50d165231e6768ddcba257526e02117366581b75772243ce7`
- `anky` measure.json sha256 `0ff785ea6e4a25b9883c6c4e6a9c3410ef1f02a6339fd6b27a4c4a6b4467741d` · idle PNG sha256 `1e5b6f2db97a9797eecabbd26daad6ab8dcd0f24a3bd8870d757ea068b635dd4`, `78e8e00bd1f4c9ced8eb22090a59aed63c14cd63bf313e54944d713ee0136e49`
- `stego` measure.json sha256 `70950d6b4db44fbd6dfab85e684395f9be4bd26c083fd580b0aa01c1926ff7a7` · idle PNG sha256 `4a24997c0b50cdfa70b3047d641368e3262b89899e5d1785095129aa2bfe0caa`, `a30d034716323b4077c1987cb7b2e67187ac1bca167571a16b4c653e5042be3f`
- `carno` measure.json sha256 `68fda16d9d550fb4802152040db34f73715df1676f4e02fab7d6b4127f07ae30` · idle PNG sha256 `30f8b56cc66a7e254d3959fc5148a9814ab5fc7bbe7d3fdaceaab7ce3c67f80c`, `d1033fececa114d5cc341e7d1dabafd29219acfaaac6723b8439d6f705fe37aa`
- `pachy` measure.json sha256 `746792f32aa686d04701df13e8e4b4a792575fe36bddc4ee87ee8023a2d225bd` · idle PNG sha256 `aba476f2e3a31e60f2c63d69338548789a7517940ce6a5c11f6d642c81eab208`, `e717eb61bb2ebd36d4cb1d98b9d8f65c21acafb22ef06b0764ad63267ac0007f`
- `theri` measure.json sha256 `dbaa15e775d0714253f0a65524184d3768435aec19836ae19cb09337c5a6280c` · idle PNG sha256 `8964823706a0e879cce01c2590da7ae48dfc7d569aa846a979a0647fb8f174d0`, `af468eb0d5396f467aa82c13dc6d89ce168c9d030570f186f2394e37935e5dc3`
- `dilo` measure.json sha256 `19a9974bb92e670c1144022b214947687cdbf074ea50cc903ec7c2a51a94ac71` · idle PNG sha256 `676209ec116cb71fe205fee50c6646b1263750b0d0b502b6d5232d6a33daefbd`, `deb92c51f3e841fe69e666b49a4ea267cce65b5bee9ca1eebfa6693cf5388039`
- `brachio` measure.json sha256 `741b5fe9d32c55f98cabdac9381827ec5aa87c71ffe586ec1c31feb23b7d3c61` · idle PNG sha256 `27e92bfe906c4f3da9d131046faf0c65ad21e58e755993805fe27c2221f55cca`, `3e03d094fec5ac1415601f1bc037829088aa2f29e1547b9b08c89f9bf542eb72`
- `ptera` measure.json sha256 `eac8139f7582ed75769f2bf43c8743fe1c37153e45e1f073cd4079b6350b5d42` · idle PNG sha256 `e23f99d03fb0e34b9c12c284c0dee4afb2b2dbdb0250b6ae4bb4e9bd00d8681f`, `fd9a06e14da59d4e416627e3887eecb5100b5bbc0eab1ef9c3166579a366f603`
