import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var session: SessionViewModel

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Тело в цифрах")
                        .font(.largeTitle.bold())
                        .foregroundStyle(.primary)

                    Text("Войди в тот же аккаунт, что используешь в web-версии.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 0) {
                    TextField("Email", text: $session.email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding()

                    Divider()
                        .padding(.leading)

                    SecureField("Пароль", text: $session.password)
                        .textContentType(.password)
                        .padding()
                }
                .background(.background)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                if let errorMessage = session.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }

                Button {
                    Task {
                        await session.signIn()
                    }
                } label: {
                    HStack {
                        Spacer()
                        if session.isLoading {
                            ProgressView()
                        } else {
                            Text("Войти")
                                .font(.headline)
                        }
                        Spacer()
                    }
                    .frame(height: 52)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(session.isLoading)

                #if DEBUG
                if session.canUseDeveloperSession {
                    Button {
                        session.signInAsDeveloper()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Войти в dev-режиме")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                        }
                        .frame(height: 44)
                    }
                    .buttonStyle(.bordered)
                }
                #endif

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 72)
        }
        .onSubmit {
            if !session.isLoading {
                Task {
                    await session.signIn()
                }
            }
        }
    }
}
