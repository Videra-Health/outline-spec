{
  description = "outline-spec - outline specs for AI-assisted development";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = f: nixpkgs.lib.genAttrs supportedSystems f;

      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ self.overlays.default ];
        };
    in
    {
      overlays.default = final: _prev: {
        outline-spec = final.stdenv.mkDerivation (finalAttrs: {
          pname = "outline-spec";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

          src = final.lib.fileset.toSource {
            root = ./.;
            fileset = final.lib.fileset.unions [
              ./src
              ./bin
              ./schemas
              ./scripts
              ./test
              ./package.json
              ./pnpm-lock.yaml
              ./pnpm-workspace.yaml
              ./tsconfig.json
              ./build.js
              ./vitest.config.ts
              ./vitest.setup.ts
              ./eslint.config.js
            ];
          };

          pnpmDeps = final.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            pnpm = final.pnpm_10;
            fetcherVersion = 3;
            hash = "sha256-NIMHf7t+FnBgsswDtB1k4E/zX1ks1r3708ggE2ps9E8=";
          };

          nativeBuildInputs = with final; [
            installShellFiles
            nodejs_22
            npmHooks.npmInstallHook
            pnpmConfigHook
            pnpm_10
          ];

          buildPhase = ''
            runHook preBuild

            pnpm run build

            runHook postBuild
          '';

          dontNpmPrune = true;

          # `outline-spec completion generate` renders a static command registry, so it
          # needs no project and no network.
          postInstall = final.lib.optionalString (final.stdenv.buildPlatform.canExecute final.stdenv.hostPlatform) ''
            completions=$(mktemp -d)
            for shell in bash fish zsh; do
              $out/bin/outline-spec completion generate "$shell" > "$completions/outline-spec.$shell"
            done
            installShellCompletion --cmd outline-spec \
              --bash "$completions/outline-spec.bash" \
              --fish "$completions/outline-spec.fish" \
              --zsh "$completions/outline-spec.zsh"
          '';

          meta = with final.lib; {
            description = "AI-native system for spec-driven development";
            homepage = "https://github.com/Videra-Health/outline-spec";
            license = licenses.mit;
            maintainers = [ ];
            mainProgram = "outline-spec";
          };
        });
      };

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.outline-spec;
          inherit (pkgs) outline-spec;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/outline-spec";
        };
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs_22
              pnpm_10
            ];

            shellHook = ''
              echo "outline-spec development environment"
              echo "Node version: $(node --version)"
              echo "pnpm version: $(pnpm --version)"
              echo "Run 'pnpm install' to install dependencies"
            '';
          };
        }
      );
    };
}
