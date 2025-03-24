"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// tests/routes/authRoutes.test.ts
const chai_1 = require("chai");
const sinon_1 = __importDefault(require("sinon"));
const authController_1 = require("../../../src/controllers/authController");
const userService_1 = require("../../../src/services/userService");
const models_1 = require("@/types/models");
describe("Auth Controller", () => {
    afterEach(() => {
        sinon_1.default.restore();
    });
    describe("register", () => {
        it("should register a new user successfully", async () => {
            // Setup mocks
            const req = {
                body: {
                    email: "test@example.com",
                    password: "Password123",
                    first_name: "Test",
                    last_name: "User",
                    username: "testuser",
                },
            };
            const res = {
                status: sinon_1.default.stub().returnsThis(),
                json: sinon_1.default.spy(),
            };
            // Stub UserService methods
            sinon_1.default.stub(userService_1.UserService, "findUserByEmail").resolves(null);
            sinon_1.default.stub(userService_1.UserService, "findUserByUsername").resolves(null);
            sinon_1.default.stub(userService_1.UserService, "createUser").resolves({
                id: "test-uuid",
                email: req.body.email,
                first_name: req.body.first_name,
                last_name: req.body.last_name,
                username: req.body.username,
                password_hash: "hashedpassword123",
                role: models_1.UserRole.USER,
                is_verified: false,
                is_active: true,
                created_at: "",
                updated_at: "",
            });
            // Execute
            await authController_1.AuthController.register(req, res);
            // Assert
            (0, chai_1.expect)(res.status.calledWith(201)).to.be.true;
            (0, chai_1.expect)(res.json.calledOnce).to.be.true;
            (0, chai_1.expect)(res.json.firstCall.args[0].status).to.equal("success");
        });
    });
});
//# sourceMappingURL=authRoutes.test.js.map